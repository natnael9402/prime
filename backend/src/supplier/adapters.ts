import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export const UNLIMITED_STOCK = 100000;
export const SUPPLIER_CODES = ['HUBX', 'GEMINIPRO', 'DANTEHUB'] as const;

export function isSupplierBacked(source?: string | null): boolean {
  return SUPPLIER_CODES.includes((source || '').toUpperCase() as any);
}

/** Supplier-normalized product shape consumed by admin UI + import + sync. */
export interface NormalizedSupplierProduct {
  id: string;
  slug: string;
  name: string;
  description?: string;
  priceUSD: number;
  stock: number;
  unlimited: boolean;
  imageUrl: string | null;
  supplier: string;
}

export interface SupplierOrderResult {
  supplierOrderId: string;
  items: string[];
  status: string;
}

export interface SupplierAdapter {
  code: string;
  label: string;
  keyPrefix: string;
  readonly configured: boolean;
  readonly keyMode: 'test' | 'live' | 'none';
  readonly baseUrl: string;
  balance(): Promise<{ amount: string; currency: string }>;
  listProducts(): Promise<NormalizedSupplierProduct[]>;
  getProduct(id: string): Promise<NormalizedSupplierProduct>;
  createOrder(supplierProductId: string, quantity: number, idempotencyKey?: string): Promise<SupplierOrderResult>;
  /** Fetch an already-created order (retry path — never buys twice). */
  getOrder(supplierOrderId: string): Promise<SupplierOrderResult>;
}

const logger = new Logger('SupplierAdapters');

async function http<T>(
  label: string,
  method: 'get' | 'post',
  url: string,
  headers: Record<string, string>,
  body?: any,
): Promise<T> {
  try {
    const res = await axios.request({ method, url, data: body, headers, timeout: 20000 });
    return res.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const msg =
      err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      (typeof err?.response?.data?.error === 'string' ? err.response.data.error : '') ||
      err?.message ||
      'Supplier request failed';
    logger.warn(`${label} ${method.toUpperCase()} ${url} → ${status}: ${msg}`);
    if (status === 402) throw new BadRequestException('Insufficient supplier wallet balance (402)');
    if (status === 409) throw new BadRequestException('Supplier out of stock (409)');
    if (status === 401) throw new ServiceUnavailableException(`${label} API key invalid or revoked (401)`);
    if (status === 404) throw new BadRequestException('Supplier product/order not found (404)');
    throw new ServiceUnavailableException(`${label} error: ${msg}`);
  }
}

/** Split a supplier-delivered value into individual item strings. */
export function valueToItems(value: any): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch {
      /* plain string */
    }
    return [value.trim()].filter(Boolean);
  }
  return [JSON.stringify(value)];
}

// ---------------- HubX (existing) ----------------

export class HubxAdapter implements SupplierAdapter {
  code = 'HUBX';
  label = 'HubX';
  keyPrefix = 'rsk_';
  private static DEFAULT_BASE = 'https://open-greeting-glow-production.up.railway.app/api/public/reseller/v1';

  constructor(private config: ConfigService) {}

  private get key(): string {
    return this.config.get<string>('SUPPLIER_API_KEY') || '';
  }

  get configured(): boolean {
    return this.key.startsWith(this.keyPrefix) && this.key.length > 12;
  }

  get keyMode(): 'test' | 'live' | 'none' {
    if (this.key.startsWith('rsk_test_')) return 'test';
    if (this.key.startsWith('rsk_live_')) return 'live';
    return 'none';
  }

  get baseUrl(): string {
    return (this.config.get<string>('SUPPLIER_BASE_URL') || HubxAdapter.DEFAULT_BASE).replace(/\/$/, '');
  }

  private headers() {
    return { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' };
  }

  private req<T = any>(method: 'get' | 'post', path: string, body?: any): Promise<T> {
    if (!this.configured) {
      throw new ServiceUnavailableException('HubX key not configured. Set SUPPLIER_API_KEY (rsk_test_… / rsk_live_…).');
    }
    return http<T>(this.label, method, `${this.baseUrl}${path}`, this.headers(), body);
  }

  async balance() {
    const bal = await this.req('get', '/balance');
    return { amount: String(bal.balance_usdt ?? '0'), currency: 'USDT' };
  }

  private normalize(p: any): NormalizedSupplierProduct {
    return {
      id: String(p.id ?? p.slug),
      slug: String(p.slug || p.id),
      name: String(p.name),
      description: p.description ? String(p.description) : undefined,
      priceUSD: Number(p.price_usdt) || 0,
      stock: Number(p.stock) || 0,
      unlimited: Number(p.stock) >= UNLIMITED_STOCK,
      imageUrl: p.image_url || p.imageUrl || p.image || null,
      supplier: this.code,
    };
  }

  async listProducts() {
    const data = await this.req('get', '/products');
    return ((data.products || []) as any[]).map((p) => this.normalize(p));
  }

  async getProduct(id: string) {
    const data = await this.req('get', `/products/${id}`);
    if (!data.product) throw new BadRequestException('Supplier product not found');
    return this.normalize(data.product);
  }

  async createOrder(supplierProductId: string, quantity: number, idempotencyKey?: string) {
    const res = await this.req('post', '/orders', {
      product_id: supplierProductId,
      quantity,
      ...(idempotencyKey ? { external_order_id: idempotencyKey } : {}),
    });
    return {
      supplierOrderId: String(res.order_id || ''),
      items: (res.items || []) as string[],
      status: 'completed',
    };
  }

  async getOrder(supplierOrderId: string) {
    const data = await this.req('get', `/orders/${supplierOrderId}`);
    const o = data.order || data;
    return {
      supplierOrderId,
      items: (o.items || []) as string[],
      status: String(o.status || 'unknown'),
    };
  }
}

// ---------------- GeminiPro ----------------

export class GeminiProAdapter implements SupplierAdapter {
  code = 'GEMINIPRO';
  label = 'GeminiPro';
  keyPrefix = 'rsp_';
  // Supplier migrated domains (Nov 2026): api-geminipro.ignorelist.com now
  // serves a cert for api.renqis.online — every call fails TLS validation.
  private static DEFAULT_BASE = 'https://api.renqis.online/api/reseller/v1';

  constructor(private config: ConfigService) {}

  private get key(): string {
    return this.config.get<string>('GEMINIPRO_API_KEY') || '';
  }

  get configured(): boolean {
    return this.key.startsWith(this.keyPrefix) && this.key.length > 12;
  }

  get keyMode(): 'test' | 'live' | 'none' {
    if (this.key.startsWith('rsp_test_')) return 'test';
    if (this.key.startsWith('rsp_live_')) return 'live';
    return 'none';
  }

  get baseUrl(): string {
    return (this.config.get<string>('GEMINIPRO_BASE_URL') || GeminiProAdapter.DEFAULT_BASE).replace(/\/$/, '');
  }

  private headers() {
    return { 'X-API-Key': this.key, 'Content-Type': 'application/json' };
  }

  private req<T = any>(method: 'get' | 'post', path: string, body?: any): Promise<T> {
    if (!this.configured) {
      throw new ServiceUnavailableException('GeminiPro key not configured. Set GEMINIPRO_API_KEY (rsp_live_…).');
    }
    return http<T>(this.label, method, `${this.baseUrl}${path}`, this.headers(), body);
  }

  async balance() {
    const bal = await this.req('get', '/account/balance');
    return { amount: String(bal.balance ?? '0'), currency: bal.currency || 'USD' };
  }

  private normalize(p: any): NormalizedSupplierProduct {
    return {
      id: String(p.productId ?? p.id),
      slug: `gem-${p.productId ?? p.id}`,
      name: String(p.name || p.title),
      description: p.description ? String(p.description) : undefined,
      priceUSD: Number(p.price) || 0,
      stock: Number(p.stock) || 0,
      unlimited: Number(p.stock) >= UNLIMITED_STOCK,
      imageUrl: p.image || p.imageUrl || null,
      supplier: this.code,
    };
  }

  async listProducts() {
    const data = await this.req('get', '/products');
    return ((data.products || []) as any[]).map((p) => this.normalize(p));
  }

  async getProduct(id: string) {
    const data = await this.req('get', `/products/${id}`);
    if (!data.product) throw new BadRequestException('Supplier product not found');
    return this.normalize(data.product);
  }

  async createOrder(supplierProductId: string, quantity: number) {
    // NOTE: GeminiPro has no idempotency key — the caller must check
    // supplierOrderId first and use getOrder() on retries.
    const data = await this.req('post', '/orders', {
      productId: Number(supplierProductId),
      quantity,
    });
    const o = data.order || {};
    return {
      supplierOrderId: String(o.orderCode || ''),
      items: valueToItems(o.value),
      status: String(o.status || 'unknown'),
    };
  }

  async getOrder(supplierOrderId: string) {
    const data = await this.req('get', `/orders/${supplierOrderId}`);
    const o = data.order || {};
    return {
      supplierOrderId,
      items: valueToItems(o.value),
      status: String(o.status || 'unknown'),
    };
  }
}

// ---------------- DanteHub ----------------

function cleanDanteText(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const cleaned = String(raw).replace(/\[\[\d{10,25}\]\]\s*/g, '').trim();
  return cleaned || undefined;
}

export class DanteHubAdapter implements SupplierAdapter {
  code = 'DANTEHUB';
  label = 'DanteHub';
  keyPrefix = 'dh_';
  private static DEFAULT_BASE = 'https://dantehub.shop/api/public/v1';
  private catalogCache: { items: NormalizedSupplierProduct[]; at: number } | null = null;

  constructor(private config: ConfigService) {}

  private get key(): string {
    return (this.config.get<string>('DANTEHUB_API_KEY') || '').trim();
  }

  get configured(): boolean {
    return this.key.startsWith(this.keyPrefix) && this.key.length > 16;
  }

  get keyMode(): 'test' | 'live' | 'none' {
    if (!this.configured) return 'none';
    if (this.key.startsWith('dh_test_')) return 'test';
    return 'live';
  }

  get baseUrl(): string {
    return (this.config.get<string>('DANTEHUB_BASE_URL') || DanteHubAdapter.DEFAULT_BASE).replace(/\/$/, '');
  }

  private headers() {
    return { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' };
  }

  private req<T = any>(method: 'get' | 'post', path: string, body?: any): Promise<T> {
    if (!this.configured) {
      throw new ServiceUnavailableException('DanteHub key not configured. Set DANTEHUB_API_KEY (dh_live_…).');
    }
    return http<T>(this.label, method, `${this.baseUrl}${path}`, this.headers(), body);
  }

  async balance() {
    const bal = await this.req('get', '/balance');
    return { amount: String(bal.balance ?? '0'), currency: String(bal.currency || 'USDT') };
  }

  private normalize(p: any): NormalizedSupplierProduct {
    const id = String(p.id);
    const title = String(p.title || p.name || id);
    const slugTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      .slice(0, 40);
    const inStock = p.in_stock !== false && p.stock !== 0;
    const unlimited = inStock && (p.stock === null || p.stock === undefined || Number(p.stock) >= UNLIMITED_STOCK);
    const stock = !inStock ? 0 : unlimited ? UNLIMITED_STOCK : Math.max(0, Number(p.stock) || 0);

    return {
      id,
      slug: `dh-${id.slice(0, 8)}-${slugTitle || 'item'}`,
      name: title,
      description: cleanDanteText(p.description),
      priceUSD: Number(p.price) || 0,
      stock,
      unlimited,
      imageUrl: p.image_url || p.imageUrl || p.image || null,
      supplier: this.code,
    };
  }

  async listProducts(forceRefresh = false): Promise<NormalizedSupplierProduct[]> {
    // Respect DanteHub's 60 req/min guideline by caching the 1200+ item catalog for 45s
    if (!forceRefresh && this.catalogCache && Date.now() - this.catalogCache.at < 45_000) {
      return this.catalogCache.items;
    }
    const data = await this.req('get', '/products');
    const items = ((data.products || []) as any[]).map((p) => this.normalize(p));
    this.catalogCache = { items, at: Date.now() };
    return items;
  }

  async getProduct(id: string): Promise<NormalizedSupplierProduct> {
    // DanteHub has no GET /products/:id endpoint — resolve from catalogue
    const list = await this.listProducts(false);
    let hit = list.find((p) => p.id === id);
    if (!hit) {
      const fresh = await this.listProducts(true);
      hit = fresh.find((p) => p.id === id);
    }
    if (!hit) throw new BadRequestException('DanteHub product not found');
    return hit;
  }

  async createOrder(supplierProductId: string, quantity: number, idempotencyKey?: string): Promise<SupplierOrderResult> {
    const qty = Math.max(1, Math.min(20, Math.floor(quantity || 1)));
    const safeRef = (idempotencyKey || `DH-${Date.now()}`)
      .replace(/[^A-Za-z0-9._:-]/g, '-')
      .slice(0, 64);

    const res = await this.req('post', '/orders', {
      product_id: supplierProductId,
      qty,
      ref: safeRef,
    });
    const o = res.order || {};
    return {
      supplierOrderId: String(o.order_id || o.ref || safeRef),
      items: valueToItems(o.delivery),
      status: String(o.status || 'processing'),
    };
  }

  async getOrder(supplierOrderId: string): Promise<SupplierOrderResult> {
    const data = await this.req('get', `/orders/${encodeURIComponent(supplierOrderId)}`);
    const o = data.order || {};
    return {
      supplierOrderId: String(o.order_id || supplierOrderId),
      items: valueToItems(o.delivery),
      status: String(o.status || 'unknown'),
    };
  }
}

/** All known suppliers, keyed by product.source. */
export function buildSupplierRegistry(config: ConfigService): Record<string, SupplierAdapter> {
  const hubx = new HubxAdapter(config);
  const gemini = new GeminiProAdapter(config);
  const dante = new DanteHubAdapter(config);
  return { [hubx.code]: hubx, [gemini.code]: gemini, [dante.code]: dante };
}
