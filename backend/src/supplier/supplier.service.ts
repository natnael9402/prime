import { Injectable, BadRequestException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CacheService } from '../infra/cache.service';
import { ProductTranslations } from '../products/translation.service';
import { StockAlertsService } from '../stock-alerts/stock-alerts.service';
import { SupplierAdapter, buildSupplierRegistry } from './adapters';

/** How often local stock mirrors the suppliers (minutes). 0 disables. */
const DEFAULT_SYNC_INTERVAL_MIN = 5;
/** Minimum gap between any two syncs — failures can't spam the suppliers. */
const SYNC_DEBOUNCE_MS = 60_000;

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
  private syncing = false;
  private lastSyncAt = 0;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private settings: SettingsService,
    private cache: CacheService,
    private stockAlerts: StockAlertsService,
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
   * Retries NEVER buy twice: when supplierOrderId exists we fetch the
   * original purchase instead of creating a new one.
   */
  async fulfillOrder(orderId: string): Promise<{ items: string[]; supplierOrderId: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { product: true },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (!order.product?.supplierProductId) {
      throw new BadRequestException('Order product is not supplier-backed');
    }
    const a = this.adapter(order.product.source || 'HUBX');

    await this.prisma.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: 'PENDING', fulfillmentError: null },
    });

    try {
      const result = order.supplierOrderId
        ? await a.getOrder(order.supplierOrderId)
        : await a.createOrder(order.product.supplierProductId, order.quantity || 1, order.txRef);

      if (!result.items.length) {
        throw new BadRequestException(`${a.label} order ${result.supplierOrderId} has no delivered items yet`);
      }

      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStatus: 'DELIVERED',
          supplierOrderId: result.supplierOrderId || order.supplierOrderId,
          licenseKey: result.items.join('\n'),
          fulfillmentError: null,
        },
      });

      // Decrement local stock mirror
      await this.prisma.product.update({
        where: { id: order.productId },
        data: { stock: { decrement: order.quantity || 1 } },
      });

      return { items: result.items, supplierOrderId: result.supplierOrderId };
    } catch (err: any) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { fulfillmentStatus: 'FAILED', fulfillmentError: err.message },
      });
      // A failure (esp. 409 out-of-stock) means local stock is stale — resync now
      this.requestSync('fulfillment-failed');
      throw err;
    }
  }
}
