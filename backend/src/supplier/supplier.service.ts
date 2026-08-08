import { Injectable, BadRequestException, ServiceUnavailableException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CacheService } from '../infra/cache.service';
import { ProductTranslations } from '../products/translation.service';
import { StockAlertsService } from '../stock-alerts/stock-alerts.service';

const DEFAULT_BASE = 'https://open-greeting-glow-production.up.railway.app/api/public/reseller/v1';
export const UNLIMITED_STOCK = 100000;

/** How often local stock mirrors the supplier (minutes). 0 disables. */
const DEFAULT_SYNC_INTERVAL_MIN = 5;
/** Minimum gap between any two syncs — failures can't spam the supplier. */
const SYNC_DEBOUNCE_MS = 60_000;

@Injectable()
export class SupplierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupplierService.name);
  private syncTimer: NodeJS.Timeout | null = null;
  private syncing = false;
  private lastSyncAt = 0;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private settings: SettingsService,
    private cache: CacheService,
    private stockAlerts: StockAlertsService,
  ) {}

  onModuleInit() {
    const raw = (this.config.get<string>('SUPPLIER_SYNC_INTERVAL_MINUTES') || '').trim();
    const minutes = raw === '' ? DEFAULT_SYNC_INTERVAL_MIN : Number(raw);
    if (!this.configured) {
      this.logger.warn('Supplier key not configured — automatic stock sync disabled.');
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

  get configured(): boolean {
    const key = this.config.get<string>('SUPPLIER_API_KEY') || '';
    return key.startsWith('rsk_') && key.length > 12;
  }

  get keyMode(): 'test' | 'live' | 'none' {
    const key = this.config.get<string>('SUPPLIER_API_KEY') || '';
    if (key.startsWith('rsk_test_')) return 'test';
    if (key.startsWith('rsk_live_')) return 'live';
    return 'none';
  }

  private get baseUrl(): string {
    return (this.config.get<string>('SUPPLIER_BASE_URL') || DEFAULT_BASE).replace(/\/$/, '');
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.config.get<string>('SUPPLIER_API_KEY')}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T = any>(method: 'get' | 'post', path: string, body?: any): Promise<T> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Supplier API key not configured. Set SUPPLIER_API_KEY (rsk_test_… or rsk_live_…).',
      );
    }
    try {
      const res = await axios.request({
        method,
        url: `${this.baseUrl}${path}`,
        data: body,
        headers: this.headers(),
        timeout: 20000,
      });
      return res.data;
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Supplier request failed';
      this.logger.warn(`Supplier ${method.toUpperCase()} ${path} → ${status}: ${msg}`);
      if (status === 402) throw new BadRequestException('Insufficient supplier wallet balance (402)');
      if (status === 409) throw new BadRequestException('Supplier out of stock (409)');
      if (status === 401) throw new ServiceUnavailableException('Supplier API key invalid or revoked (401)');
      if (status === 404) throw new BadRequestException('Supplier product/order not found (404)');
      throw new ServiceUnavailableException(`Supplier error: ${msg}`);
    }
  }

  async status() {
    const info: any = {
      configured: this.configured,
      keyMode: this.keyMode,
      baseUrl: this.baseUrl,
      balance: null,
    };
    if (this.configured) {
      try {
        const bal = await this.request('get', '/balance');
        info.balance = bal;
      } catch (err: any) {
        info.balanceError = err.message;
      }
    }
    return info;
  }

  async listProducts() {
    const data = await this.request('get', '/products');
    const products = (data.products || []) as any[];

    // Annotate with local import state + computed ETB pricing preview
    const settings = await this.settings.getAll();
    const imported = await this.prisma.product.findMany({
      where: { source: 'HUBX' },
      select: { supplierProductId: true, id: true },
    });
    const importedMap = new Map(imported.map((p) => [p.supplierProductId, p.id]));

    return products.map((p) => {
      const pricing = this.settings.computePrice(
        { costUSD: p.price_usdt, marginMultiplier: null, discountPct: 0 },
        settings,
      );
      return {
        ...p,
        unlimited: p.stock >= UNLIMITED_STOCK,
        importedLocalId: importedMap.get(p.id) || importedMap.get(p.slug) || null,
        pricePreviewETB: pricing.final,
      };
    });
  }

  async importProduct(dto: {
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
  }) {
    const data = await this.request('get', `/products/${dto.supplierProductId}`);
    const sp = data.product;
    if (!sp) throw new BadRequestException('Supplier product not found');

    const settings = await this.settings.getAll();
    const pricing = this.settings.computePrice(
      { costUSD: sp.price_usdt, marginMultiplier: dto.marginMultiplier || null, discountPct: dto.discountPct || 0 },
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
    const slug = `hubx-${sp.slug}`.replace(/[^a-z0-9-]+/g, '-');
    const supplierImage = sp.image_url || sp.imageUrl || sp.image || null;
    const banner =
      dto.bannerUrl ||
      supplierImage ||
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80';
    const gallery = Array.from(
      new Set([banner, ...(Array.isArray(dto.gallery) ? dto.gallery : [])].map((url) => String(url || '').trim()).filter(Boolean)),
    );

    const existing = await this.prisma.product.findFirst({
      where: { OR: [{ slug }, { supplierProductId: sp.id }] },
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
      stock: sp.stock >= UNLIMITED_STOCK ? 9999 : sp.stock,
      instantDelivery: true,
      isFeatured: true,
      source: 'HUBX',
      supplierProductId: sp.id,
      costUSD: sp.price_usdt,
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

  async syncStock() {
    if (!this.configured) return { synced: 0, reason: 'not_configured' };
    const products = await this.listProducts();
    let synced = 0;
    for (const sp of products) {
      if (!sp.importedLocalId) continue;
      const before = await this.prisma.product.findUnique({
        where: { id: sp.importedLocalId },
        select: { stock: true },
      });
      const newStock = sp.stock >= UNLIMITED_STOCK ? 9999 : sp.stock;
      await this.prisma.product.update({
        where: { id: sp.importedLocalId },
        data: {
          stock: newStock,
          costUSD: sp.price_usdt,
        },
      });
      await this.settings.applyPricing(sp.importedLocalId);
      // Supplier restock 0 → >0: ping everyone waiting on this product
      if ((before?.stock ?? 0) <= 0 && newStock > 0) {
        this.stockAlerts.notifyRestock(sp.importedLocalId).catch(() => undefined);
      }
      synced++;
    }
    if (synced > 0) await this.cache.invalidatePattern('catalog:');
    return { synced };
  }

  /**
   * Fulfill one PAID order with the supplier. Idempotent via external_order_id = order.txRef.
   * Returns delivered items on success; throws on failure (caller records FAILED).
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

    await this.prisma.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: 'PENDING', fulfillmentError: null },
    });

    try {
      const res = await this.request('post', '/orders', {
        product_id: order.product.supplierProductId,
        quantity: order.quantity || 1,
        external_order_id: order.txRef,
      });

      const items: string[] = res.items || [];
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStatus: 'DELIVERED',
          supplierOrderId: res.order_id || null,
          licenseKey: items.join('\n'),
          fulfillmentError: null,
        },
      });

      // Decrement local stock mirror
      await this.prisma.product.update({
        where: { id: order.productId },
        data: { stock: { decrement: order.quantity || 1 } },
      });

      return { items, supplierOrderId: res.order_id };
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
