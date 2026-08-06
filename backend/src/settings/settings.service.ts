import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../infra/cache.service';

export const SETTING_KEYS = {
  USD_TO_ETB: 'usdToEtb',
  MARGIN: 'marginMultiplier',
  GLOBAL_DISCOUNT: 'globalDiscountPct',
};

const DEFAULTS: Record<string, number> = {
  [SETTING_KEYS.USD_TO_ETB]: 200,
  [SETTING_KEYS.MARGIN]: 3,
  [SETTING_KEYS.GLOBAL_DISCOUNT]: 0,
};

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async getAll() {
    const rows = await this.prisma.setting.findMany();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const num = (key: string) => {
      const v = parseFloat(map.get(key) || '');
      return Number.isNaN(v) ? DEFAULTS[key] : v;
    };
    return {
      usdToEtb: num(SETTING_KEYS.USD_TO_ETB),
      marginMultiplier: num(SETTING_KEYS.MARGIN),
      globalDiscountPct: num(SETTING_KEYS.GLOBAL_DISCOUNT),
    };
  }

  async update(dto: { usdToEtb?: number; marginMultiplier?: number; globalDiscountPct?: number }) {
    const upserts: Promise<any>[] = [];
    if (dto.usdToEtb !== undefined && dto.usdToEtb > 0) {
      upserts.push(this.set(SETTING_KEYS.USD_TO_ETB, String(dto.usdToEtb)));
    }
    if (dto.marginMultiplier !== undefined && dto.marginMultiplier > 0) {
      upserts.push(this.set(SETTING_KEYS.MARGIN, String(dto.marginMultiplier)));
    }
    if (dto.globalDiscountPct !== undefined && dto.globalDiscountPct >= 0 && dto.globalDiscountPct < 100) {
      upserts.push(this.set(SETTING_KEYS.GLOBAL_DISCOUNT, String(dto.globalDiscountPct)));
    }
    await Promise.all(upserts);

    // Recompute every AUTO-priced product with the new economics
    await this.recomputeAllAutoPrices();

    // Prices changed → cached catalog is stale
    await this.cache.invalidatePattern('catalog:');

    return this.getAll();
  }

  private async set(key: string, value: string) {
    return this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  /** Price math: costUSD × rate × margin = base ETB; minus discounts = final price. */
  computePrice(
    product: { costUSD?: number | null; marginMultiplier?: number | null; discountPct?: number | null; price?: number },
    settings: { usdToEtb: number; marginMultiplier: number; globalDiscountPct: number },
  ) {
    const margin = product.marginMultiplier || settings.marginMultiplier;
    const base = product.costUSD != null ? product.costUSD * settings.usdToEtb * margin : product.price || 0;
    const discount = (settings.globalDiscountPct || 0) + (product.discountPct || 0);
    const clamped = Math.min(discount, 95);
    const final = Math.max(1, Math.round(base * (1 - clamped / 100)));
    return {
      base: Math.round(base),
      final,
      effectiveDiscountPct: clamped,
      margin,
    };
  }

  /** Recompute & persist price/originalPrice for one product row. */
  async applyPricing(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) return null;
    const settings = await this.getAll();

    if (product.priceMode === 'AUTO' && product.costUSD != null) {
      const { base, final, effectiveDiscountPct } = this.computePrice(product, settings);
      await this.prisma.product.update({
        where: { id: productId },
        data: {
          originalPrice: effectiveDiscountPct > 0 ? base : product.originalPrice,
          price: final,
        },
      });
    } else {
      // MANUAL: discount applies to the manual price
      const discount = (settings.globalDiscountPct || 0) + (product.discountPct || 0);
      const clamped = Math.min(discount, 95);
      if (clamped > 0) {
        const base = product.originalPrice || product.price;
        const final = Math.max(1, Math.round(base * (1 - clamped / 100)));
        await this.prisma.product.update({
          where: { id: productId },
          data: { originalPrice: base, price: final },
        });
      }
    }

    return this.prisma.product.findUnique({ where: { id: productId } });
  }

  async recomputeAllAutoPrices() {
    const autoProducts = await this.prisma.product.findMany({
      where: { priceMode: 'AUTO', costUSD: { not: null } },
    });
    for (const p of autoProducts) {
      await this.applyPricing(p.id);
    }
    // Manual products with discounts also react to global discount changes
    const manualDiscounted = await this.prisma.product.findMany({
      where: { priceMode: 'MANUAL', discountPct: { gt: 0 } },
    });
    for (const p of manualDiscounted) {
      await this.applyPricing(p.id);
    }
    return { recomputed: autoProducts.length + manualDiscounted.length };
  }
}
