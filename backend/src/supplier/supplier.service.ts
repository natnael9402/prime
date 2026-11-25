import { Injectable, BadRequestException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CacheService } from '../infra/cache.service';
import { ProductTranslations } from '../products/translation.service';
import { StockAlertsService } from '../stock-alerts/stock-alerts.service';
import { TelegramService, escapeHtml } from '../telegram/telegram.service';
import { SupplierAdapter, buildSupplierRegistry, isSupplierBacked, valueToItems } from './adapters';

/** How often local stock mirrors the suppliers (minutes). 0 disables. */
const DEFAULT_SYNC_INTERVAL_MIN = 5;
/** Minimum gap between any two syncs — failures can't spam the suppliers. */
const SYNC_DEBOUNCE_MS = 60_000;
/** Poll pending async supplier orders (e.g. DanteHub manual fulfillment) every 30s. */
const PENDING_ORDER_POLL_MS = 30_000;

export interface ImportProductDto {
  supplier?: string;
  supplierProductId: string;
  categoryId: string;
  name?: string;
  shortDesc?: string;
  description?: string;
  bannerUrl?: string;
  gallery?: string[];
  marginMultiplier?: number;
  discountPct?: number;
  manualPrice?: number;
  originalPrice?: number;
  badge?: string;
  features?: string[];
  requirements?: string[];
  activationSteps?: string[];
  translations?: ProductTranslations;
}

@Injectable()
export class SupplierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupplierService.name);
  private readonly registry: Record<string, SupplierAdapter>;
  private syncTimer: NodeJS.Timeout | null = null;
  private orderPollTimer: NodeJS.Timeout | null = null;
  private syncing = false;
  private pollingOrders = false;
  private lastSyncAt = 0;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private settings: SettingsService,
    private cache: CacheService,
    private stockAlerts: StockAlertsService,
    private telegram: TelegramService,
  ) {
    this.registry = buildSupplierRegistry(config);
  }

  onModuleInit() {
    const raw = (this.config.get<string>('SUPPLIER_SYNC_INTERVAL_MINUTES') || '').trim();
    const minutes = raw === '' ? DEFAULT_SYNC_INTERVAL_MIN : Number(raw);
    if (!this.anyConfigured) {
      this.logger.warn('No supplier key configured — automatic stock sync disabled.');
      return;
    }

    // Only one instance (kv-bot or single-container api) should run periodic reconciliation
    if ((this.config.get<string>('TELEGRAM_ENABLE_BOT') || 'true') !== 'false') {
      this.orderPollTimer = setInterval(() => void this.reconcileProcessingOrders(), PENDING_ORDER_POLL_MS);
      this.orderPollTimer.unref();
    }

    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.logger.log('Automatic supplier stock sync disabled (SUPPLIER_SYNC_INTERVAL_MINUTES<=0).');
      return;
    }
    // First sync soon after boot, then on the interval
    setTimeout(() => void this.runSync('startup'), 10_000).unref();
    this.syncTimer = setInterval(() => void this.runSync('interval'), minutes * 60_000);
    this.syncTimer.unref();
    this.logger.log(`Automatic supplier stock sync every ${minutes} min.`);
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.orderPollTimer) clearInterval(this.orderPollTimer);
  }

  /** Debounced sync trigger — safe to call from anywhere (e.g. after a 409). */
  requestSync(reason: string) {
    if (Date.now() - this.lastSyncAt < SYNC_DEBOUNCE_MS) return;
    void this.runSync(reason);
  }

  private async runSync(reason: string) {
    if (this.syncing) return;
    this.syncing = true;
    this.lastSyncAt = Date.now();
    try {
      const res = await this.syncStock();
      if (res.synced > 0) this.logger.log(`Stock sync (${reason}): ${res.synced} product(s) updated.`);
    } catch (err: any) {
      this.logger.warn(`Stock sync (${reason}) failed: ${err?.message}`);
    } finally {
      this.syncing = false;
    }
  }

  // ---------- Registry ----------

  adapter(code?: string): SupplierAdapter {
    const a = this.registry[(code || 'HUBX').toUpperCase()];
    if (!a) throw new BadRequestException(`Unknown supplier: ${code}`);
    return a;
  }

  get anyConfigured(): boolean {
    return Object.values(this.registry).some((a) => a.configured);
  }

  /** Admin: the supplier switcher. */
  listSuppliers() {
    return Object.values(this.registry).map((a) => ({
      code: a.code,
      label: a.label,
      configured: a.configured,
      keyMode: a.keyMode,
    }));
  }

  async status(code?: string) {
    const a = this.adapter(code);
    const info: any = {
      supplier: a.code,
      label: a.label,
      configured: a.configured,
      keyMode: a.keyMode,
      baseUrl: a.baseUrl,
      balanceAmount: null,
      balanceCurrency: null,
    };
    if (a.configured) {
      try {
        const bal = await a.balance();
        info.balanceAmount = bal.amount;
        info.balanceCurrency = bal.currency;
      } catch (err: any) {
        info.balanceError = err.message;
      }
    }
    return info;
  }

  async listProducts(code?: string) {
    const a = this.adapter(code);
    const products = await a.listProducts();

    // Annotate with local import state + computed ETB pricing preview
    const settings = await this.settings.getAll();
    const imported = await this.prisma.product.findMany({
      where: { source: a.code },
      select: { supplierProductId: true, id: true },
    });
    const importedMap = new Map(imported.map((p) => [p.supplierProductId, p.id]));

    return products.map((p) => ({
      ...p,
      supplierLabel: a.label,
      importedLocalId: importedMap.get(p.id) || null,
      pricePreviewETB: this.settings.computePrice(
        { costUSD: p.priceUSD, marginMultiplier: null, discountPct: 0 },
        settings,
      ).final,
    }));
  }

  async importProduct(dto: ImportProductDto) {
    const a = this.adapter(dto.supplier);
    const sp = await a.getProduct(dto.supplierProductId);

    const settings = await this.settings.getAll();
    const pricing = this.settings.computePrice(
      { costUSD: sp.priceUSD, marginMultiplier: dto.marginMultiplier || null, discountPct: dto.discountPct || 0 },
      settings,
    );

    const manualPrice = dto.manualPrice !== undefined && dto.manualPrice !== null && Number(dto.manualPrice) > 0;
    const finalPrice = manualPrice ? Math.max(1, Math.round(Number(dto.manualPrice))) : pricing.final;
    const originalPrice = manualPrice
      ? dto.originalPrice && Number(dto.originalPrice) > finalPrice
        ? Math.round(Number(dto.originalPrice))
        : null
      : pricing.effectiveDiscountPct > 0
        ? pricing.base
        : null;

    const name = String(dto.name || sp.name).trim();
    const slug = (a.code === 'HUBX' ? `hubx-${sp.slug}` : sp.slug).replace(/[^a-z0-9-]+/g, '-');
    const banner =
      dto.bannerUrl ||
      sp.imageUrl ||
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80';
    const gallery = Array.from(
      new Set([banner, ...(Array.isArray(dto.gallery) ? dto.gallery : [])].map((url) => String(url || '').trim()).filter(Boolean)),
    );

    const existing = await this.prisma.product.findFirst({
      where: { OR: [{ slug }, { AND: [{ supplierProductId: sp.id }, { source: a.code }] }] },
    });

    const features = dto.features?.length
      ? dto.features
      : ['Original digital product', 'Instant delivery after payment', 'Full customer support'];
    const requirements = dto.requirements?.length ? dto.requirements : ['Internet connection required'];
    const activationSteps = dto.activationSteps?.length
      ? dto.activationSteps
      : ['Open the delivered account or license key', 'Use it on the official website or app'];

    const payload = {
      name,
      slug,
      shortDesc: String(dto.shortDesc || `${name} — instant digital delivery`).trim(),
      description: String(
        dto.description ||
          sp.description ||
          `${name}. Premium digital product with fast delivery. After your payment is confirmed, your license or account details arrive instantly.`,
      ).trim(),
      price: finalPrice,
      originalPrice,
      currency: 'ETB',
      badge: dto.badge || (sp.stock > 0 ? 'NEW' : null),
      bannerUrl: banner,
      gallery: JSON.stringify(gallery),
      features: JSON.stringify(features),
      requirements: JSON.stringify(requirements),
      translations: JSON.stringify(dto.translations || {}),
      stock: sp.unlimited ? 9999 : sp.stock,
      instantDelivery: true,
      isFeatured: true,
      source: a.code,
      supplierProductId: sp.id,
      costUSD: sp.priceUSD,
      priceMode: manualPrice ? 'MANUAL' : 'AUTO',
      marginMultiplier: dto.marginMultiplier || null,
      discountPct: dto.discountPct || 0,
      categoryId: dto.categoryId,
    };

    const product = existing
      ? await this.prisma.product.update({ where: { id: existing.id }, data: payload })
      : await this.prisma.product.create({ data: payload });

    await this.prisma.activationGuide.upsert({
      where: { productId: product.id },
      create: {
        productId: product.id,
        steps: JSON.stringify(activationSteps),
      },
      update: {
        steps: JSON.stringify(activationSteps),
      },
    });

    await this.cache.invalidatePattern('catalog:');
    return product;
  }

  /** Refresh live stock & pricing for a single supplier-backed product. */
  async refreshProductStock(productId: string) {
    const lp = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, source: true, supplierProductId: true, stock: true },
    });
    if (!lp || !lp.supplierProductId || !isSupplierBacked(lp.source)) {
      return null;
    }
    const a = this.adapter(lp.source);
    if (!a.configured) return null;
    try {
      const sp = await a.getProduct(String(lp.supplierProductId));
      const newStock = sp.unlimited ? 9999 : sp.stock;
      await this.prisma.product.update({
        where: { id: lp.id },
        data: { stock: newStock, costUSD: sp.priceUSD },
      });
      await this.settings.applyPricing(lp.id);
      await this.cache.invalidatePattern('catalog:');
      if ((lp.stock ?? 0) <= 0 && newStock > 0) {
        this.stockAlerts.notifyRestock(lp.id).catch(() => undefined);
      }
      return { stock: newStock, updatedAt: new Date() };
    } catch (err: any) {
      this.logger.warn(`Single-product refresh failed (${productId}): ${err?.message}`);
      return null;
    }
  }

  /** Sync one supplier (code given) or every configured supplier. */
  async syncStock(code?: string) {
    if (code) return this.syncSupplier(this.adapter(code));
    let synced = 0;
    for (const a of Object.values(this.registry)) {
      if (!a.configured) continue;
      try {
        synced += (await this.syncSupplier(a)).synced;
      } catch (err: any) {
        this.logger.warn(`${a.label} sync failed: ${err?.message}`);
      }
    }
    return { synced };
  }

  private async syncSupplier(a: SupplierAdapter) {
    if (!a.configured) return { synced: 0, reason: 'not_configured' };
    const remote = await a.listProducts();
    const byId = new Map(remote.map((p) => [p.id, p]));
    const local = await this.prisma.product.findMany({
      where: { source: a.code, supplierProductId: { not: null } },
      select: { id: true, supplierProductId: true, stock: true },
    });

    let synced = 0;
    for (const lp of local) {
      const sp = byId.get(String(lp.supplierProductId));
      if (!sp) continue;
      const newStock = sp.unlimited ? 9999 : sp.stock;
      await this.prisma.product.update({
        where: { id: lp.id },
        data: { stock: newStock, costUSD: sp.priceUSD },
      });
      await this.settings.applyPricing(lp.id);
      // Supplier restock 0 → >0: ping everyone waiting on this product
      if ((lp.stock ?? 0) <= 0 && newStock > 0) {
        this.stockAlerts.notifyRestock(lp.id).catch(() => undefined);
      }
      synced++;
    }
    if (synced > 0) await this.cache.invalidatePattern('catalog:');
    return { synced };
  }

  /**
   * Fulfill one PAID order with its supplier, routed by product.source.
   * Retries NEVER buy twice: supplierOrderId is persisted immediately and reused
   * on retries. Supports both instant suppliers (HubX/GeminiPro) and async
   * manual/webhook suppliers (DanteHub).
   */
  async fulfillOrder(orderId: string): Promise<{ items: string[]; supplierOrderId: string; processing?: boolean }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { product: true },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (!order.product?.supplierProductId) {
      throw new BadRequestException('Order product is not supplier-backed');
    }
    const a = this.adapter(order.product.source || 'HUBX');
    const wasProcessing = order.fulfillmentStatus === 'PROCESSING';

    if (!wasProcessing) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { fulfillmentStatus: 'PENDING', fulfillmentError: null },
      });
    }

    try {
      const result = order.supplierOrderId
        ? await a.getOrder(order.supplierOrderId)
        : await a.createOrder(order.product.supplierProductId, order.quantity || 1, order.txRef);

      // Persist supplierOrderId immediately so retries never place a second order
      if (result.supplierOrderId && result.supplierOrderId !== order.supplierOrderId) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { supplierOrderId: result.supplierOrderId },
        });
      }

      if (['cancelled', 'failed', 'refunded'].includes((result.status || '').toLowerCase())) {
        throw new BadRequestException(`${a.label} order ${result.supplierOrderId} was ${result.status}`);
      }

      if (!result.items.length) {
        // DanteHub orders frequently await manual fulfillment (status = 'processing')
        if (a.code === 'DANTEHUB' && ['processing', 'pending_payment'].includes((result.status || '').toLowerCase())) {
          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              fulfillmentStatus: 'PROCESSING',
              supplierOrderId: result.supplierOrderId || order.supplierOrderId,
              fulfillmentError: null,
            },
          });
          if (!wasProcessing && order.telegramUserId) {
            void this.telegram.sendMessage(
              order.telegramUserId,
              `⏳ <b>Payment Confirmed — Preparing Your Order</b>\n\n` +
                `📦 <b>${escapeHtml(order.product.name)}</b>\n` +
                `🧾 <code>${escapeHtml(order.txRef)}</code>\n\n` +
                `Your account is being prepared and will arrive right here automatically as soon as it's ready.`,
              {
                inline_keyboard: [[{ text: '📦 View Order', callback_data: `o:${order.id}`, style: 'primary' }]],
              },
            );
          }
          return { items: [], supplierOrderId: result.supplierOrderId, processing: true };
        }

        throw new BadRequestException(`${a.label} order ${result.supplierOrderId} has no delivered items yet`);
      }

      return this.completeDeliveredOrder(order, result.items, result.supplierOrderId);
    } catch (err: any) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { fulfillmentStatus: 'FAILED', fulfillmentError: err.message },
      });
      this.requestSync('fulfillment-failed');
      throw err;
    }
  }

  private async completeDeliveredOrder(order: any, items: string[], supplierOrderId: string) {
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        fulfillmentStatus: 'DELIVERED',
        supplierOrderId: supplierOrderId || order.supplierOrderId,
        licenseKey: items.join('\n'),
        fulfillmentError: null,
      },
    });

    // Decrement local stock mirror (skip if unlimited sentinel)
    if ((order.product?.stock ?? 0) < 9000) {
      await this.prisma.product.update({
        where: { id: order.productId },
        data: { stock: { decrement: order.quantity || 1 } },
      });
    }

    return { items, supplierOrderId };
  }

  /** Poll any PAID orders waiting on asynchronous supplier fulfillment (DanteHub). */
  async reconcileProcessingOrders() {
    if (this.pollingOrders) return;
    this.pollingOrders = true;
    try {
      const pending = await this.prisma.order.findMany({
        where: {
          status: 'PAID',
          fulfillmentStatus: 'PROCESSING',
          supplierOrderId: { not: null },
        },
        include: { product: { include: { activationGuide: true } } },
        take: 25,
      });

      for (const order of pending) {
        try {
          const a = this.adapter(order.product?.source || 'DANTEHUB');
          if (!a.configured) continue;
          const res = await a.getOrder(order.supplierOrderId!);
          if (res.items.length > 0 && res.status === 'delivered') {
            await this.completeDeliveredOrder(order, res.items, res.supplierOrderId);
            await this.telegram.notifyOrderPaid({
              txRef: order.txRef,
              customerName: order.customerName,
              amount: order.amount,
              currency: order.currency,
              licenseKey: res.items.join('\n'),
              telegramUserId: order.telegramUserId,
              id: order.id,
              product: order.product ? { name: order.product.name, emojiId: order.product.emojiId } : null,
            });
          } else if (['cancelled', 'failed', 'refunded'].includes((res.status || '').toLowerCase())) {
            await this.prisma.order.update({
              where: { id: order.id },
              data: { fulfillmentStatus: 'FAILED', fulfillmentError: `Supplier ${res.status}` },
            });
            void this.telegram.notifyAdmin(
              `⚠️ <b>Supplier Order ${escapeHtml(res.status)}</b>\n` +
                `📦 ${escapeHtml(order.product?.name || '-')}\n` +
                `🧾 <code>${escapeHtml(order.txRef)}</code>`,
            );
          }
        } catch (err: any) {
          this.logger.warn(`Reconcile order ${order.txRef} failed: ${err?.message}`);
        }
      }
    } finally {
      this.pollingOrders = false;
    }
  }

  /** Signed webhook receiver for DanteHub (`order.delivered` / `order.cancelled`). */
  async handleDanteHubWebhook(payload: any, rawBody: Buffer | string | undefined, signature: string | undefined) {
    const secret = (this.config.get<string>('DANTEHUB_WEBHOOK_SECRET') || '').trim();
    if (secret) {
      if (!signature || !/^[0-9a-f]{64}$/i.test(signature) || !rawBody) {
        throw new BadRequestException('Invalid DanteHub signature');
      }
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
      const received = Buffer.from(signature, 'hex');
      if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
        throw new BadRequestException('Invalid DanteHub signature');
      }
    }

    const event = String(payload?.event || '');
    if (event === 'wallet.low_balance') {
      void this.telegram.notifyAdmin(
        `⚠️ <b>DanteHub Wallet Low Balance</b>\nBalance: <b>${payload?.balance} ${payload?.currency || 'USDT'}</b>`,
      );
      return { ok: true };
    }

    const dOrder = payload?.order;
    if (!dOrder?.order_id && !dOrder?.ref) return { ok: true };

    const order = await this.prisma.order.findFirst({
      where: {
        OR: [
          ...(dOrder.order_id ? [{ supplierOrderId: String(dOrder.order_id) }] : []),
          ...(dOrder.ref ? [{ txRef: String(dOrder.ref) }] : []),
        ],
      },
      include: { product: { include: { activationGuide: true } } },
    });
    if (!order) return { ok: true };

    if (event === 'order.delivered') {
      if (order.fulfillmentStatus === 'DELIVERED' && order.licenseKey) return { ok: true };
      const items = valueToItems(dOrder.delivery);
      if (items.length > 0) {
        await this.completeDeliveredOrder(order, items, String(dOrder.order_id || order.supplierOrderId || ''));
        await this.telegram.notifyOrderPaid({
          txRef: order.txRef,
          customerName: order.customerName,
          amount: order.amount,
          currency: order.currency,
          licenseKey: items.join('\n'),
          telegramUserId: order.telegramUserId,
          id: order.id,
          product: order.product ? { name: order.product.name, emojiId: order.product.emojiId } : null,
        });
      }
      return { ok: true };
    }

    if (event === 'order.cancelled') {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { fulfillmentStatus: 'FAILED', fulfillmentError: 'Cancelled/refunded by DanteHub' },
      });
      void this.telegram.notifyAdmin(
        `⚠️ <b>DanteHub Order Cancelled</b>\n📦 ${escapeHtml(order.product?.name || '-')}\n🧾 <code>${escapeHtml(order.txRef)}</code>`,
      );
      return { ok: true };
    }

    return { ok: true };
  }
}
