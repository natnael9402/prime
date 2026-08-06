import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CacheService } from '../infra/cache.service';
import { ProductTranslations } from './translation.service';

/** Cache keys — TTLs are short so stock/price stay fresh; writes invalidate explicitly. */
const CATALOG_PREFIX = 'catalog:';
const LIST_TTL = 60;
const ITEM_TTL = 60;
const CATS_TTL = 300;

export interface CreateProductDto {
  name: string;
  slug?: string;
  description: string;
  shortDesc: string;
  price: number;
  originalPrice?: number;
  currency?: string;
  badge?: string;
  bannerUrl: string;
  gallery: string[];
  features: string[];
  requirements: string[];
  translations?: ProductTranslations;
  instantDelivery?: boolean;
  isFeatured?: boolean;
  categoryId: string;
  costUSD?: number | null;
  priceMode?: string;
  marginMultiplier?: number | null;
  discountPct?: number;
  activationGuide?: {
    steps: string[];
    downloadUrl?: string;
    notes?: string;
    videoUrl?: string;
  };
  initialKeys?: string[];
}

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private cache: CacheService,
  ) {}

  private invalidateCatalog() {
    return this.cache.invalidatePattern(CATALOG_PREFIX);
  }

  async findAll(categorySlug?: string, search?: string) {
    const cacheKey = `${CATALOG_PREFIX}list:${categorySlug || 'all'}:${(search || '').toLowerCase().trim()}`;
    return this.cache.wrap(cacheKey, LIST_TTL, async () => {
      const where: any = {};
      if (categorySlug && categorySlug !== 'all') {
        where.category = { slug: categorySlug };
      }
      if (search) {
        where.OR = [
          { name: { contains: search } },
          { description: { contains: search } },
          { shortDesc: { contains: search } },
        ];
      }

      const products = await this.prisma.product.findMany({
        where,
        include: {
          category: true,
          activationGuide: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return products.map(p => this.formatProduct(p));
    });
  }

  async findOne(idOrSlug: string) {
    const cacheKey = `${CATALOG_PREFIX}item:${idOrSlug}`;
    return this.cache.wrap(cacheKey, ITEM_TTL, async () => {
      const product = await this.prisma.product.findFirst({
        where: {
          OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        },
        include: {
          category: true,
          activationGuide: true,
          licenseKeys: {
            select: { id: true, isUsed: true, createdAt: true },
          },
        },
      });

      if (!product) {
        throw new NotFoundException(`Product with ID/Slug ${idOrSlug} not found`);
      }

      return this.formatProduct(product);
    });
  }

  /** Admin: full product rows including cost economics. */
  async adminList() {
    const products = await this.prisma.product.findMany({
      include: {
        category: true,
        activationGuide: true,
        _count: { select: { licenseKeys: true, orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const settings = await this.settings.getAll();
    return products.map((p) => ({
      ...this.formatProduct(p, true),
      ordersCount: p._count.orders,
      keysCount: p._count.licenseKeys,
      pricingPreview:
        p.costUSD != null
          ? this.settings.computePrice(
              { costUSD: p.costUSD, marginMultiplier: p.marginMultiplier, discountPct: p.discountPct },
              settings,
            )
          : null,
    }));
  }

  /** Admin: update pricing economics of a product, then recompute. */
  async updatePricing(
    id: string,
    dto: { priceMode?: string; costUSD?: number; marginMultiplier?: number | null; discountPct?: number; manualPrice?: number },
  ) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    const data: any = {};
    if (dto.priceMode !== undefined) data.priceMode = dto.priceMode;
    if (dto.costUSD !== undefined) data.costUSD = dto.costUSD === null ? null : Number(dto.costUSD);
    if (dto.marginMultiplier !== undefined)
      data.marginMultiplier = dto.marginMultiplier === null ? null : Number(dto.marginMultiplier);
    if (dto.discountPct !== undefined) data.discountPct = Math.min(95, Math.max(0, Number(dto.discountPct)));
    if (dto.manualPrice !== undefined) {
      data.originalPrice = Number(dto.manualPrice);
      data.price = Number(dto.manualPrice);
    }

    await this.prisma.product.update({ where: { id }, data });
    const result = await this.settings.applyPricing(id);
    await this.invalidateCatalog();
    return result;
  }

  async create(dto: CreateProductDto) {
    const generatedSlug = dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const slug = dto.slug || generatedSlug || `product-${Date.now()}`;

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        shortDesc: dto.shortDesc,
        price: Number(dto.price),
        originalPrice: dto.originalPrice ? Number(dto.originalPrice) : null,
        currency: dto.currency || 'ETB',
        badge: dto.badge || null,
        bannerUrl: dto.bannerUrl,
        gallery: JSON.stringify(dto.gallery || [dto.bannerUrl]),
        features: JSON.stringify(dto.features || []),
        requirements: JSON.stringify(dto.requirements || []),
        translations: JSON.stringify(dto.translations || {}),
        instantDelivery: dto.instantDelivery !== false,
        isFeatured: dto.isFeatured || false,
        costUSD: dto.costUSD !== undefined ? Number(dto.costUSD) : null,
        priceMode: dto.priceMode || 'MANUAL',
        marginMultiplier: dto.marginMultiplier !== undefined ? Number(dto.marginMultiplier) : null,
        discountPct: dto.discountPct !== undefined ? Number(dto.discountPct) : 0,
        categoryId: dto.categoryId,
      },
    });

    if (dto.activationGuide) {
      await this.prisma.activationGuide.create({
        data: {
          productId: product.id,
          steps: JSON.stringify(dto.activationGuide.steps || []),
          downloadUrl: dto.activationGuide.downloadUrl || null,
          notes: dto.activationGuide.notes || null,
          videoUrl: dto.activationGuide.videoUrl || null,
        },
      });
    }

    if (dto.initialKeys && dto.initialKeys.length > 0) {
      const cleanKeys = dto.initialKeys.map(k => k.trim()).filter(k => k.length > 0);
      if (cleanKeys.length > 0) {
        await this.prisma.licenseKey.createMany({
          data: cleanKeys.map(code => ({ productId: product.id, code, isUsed: false })),
        });
        await this.prisma.product.update({
          where: { id: product.id },
          data: { stock: cleanKeys.length },
        });
      }
    }

    // Compute derived pricing when AUTO economics are set
    if (product.priceMode === 'AUTO' || (dto.discountPct ?? 0) > 0) {
      await this.settings.applyPricing(product.id);
    }

    await this.invalidateCatalog();
    return this.findOne(product.id);
  }

  async update(id: string, dto: Partial<CreateProductDto>) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.shortDesc !== undefined) updateData.shortDesc = dto.shortDesc;
    if (dto.price !== undefined) updateData.price = Number(dto.price);
    if (dto.originalPrice !== undefined) updateData.originalPrice = dto.originalPrice ? Number(dto.originalPrice) : null;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.badge !== undefined) updateData.badge = dto.badge;
    if (dto.bannerUrl !== undefined) updateData.bannerUrl = dto.bannerUrl;
    if (dto.gallery !== undefined) updateData.gallery = JSON.stringify(dto.gallery);
    if (dto.features !== undefined) updateData.features = JSON.stringify(dto.features);
    if (dto.requirements !== undefined) updateData.requirements = JSON.stringify(dto.requirements);
    if (dto.translations !== undefined) updateData.translations = JSON.stringify(dto.translations || {});
    if (dto.instantDelivery !== undefined) updateData.instantDelivery = dto.instantDelivery;
    if (dto.isFeatured !== undefined) updateData.isFeatured = dto.isFeatured;
    if (dto.categoryId !== undefined) updateData.categoryId = dto.categoryId;
    if (dto.costUSD !== undefined) updateData.costUSD = dto.costUSD === null ? null : Number(dto.costUSD);
    if (dto.priceMode !== undefined) updateData.priceMode = dto.priceMode;
    if (dto.marginMultiplier !== undefined)
      updateData.marginMultiplier = dto.marginMultiplier === null ? null : Number(dto.marginMultiplier);
    if (dto.discountPct !== undefined) updateData.discountPct = Math.min(95, Math.max(0, Number(dto.discountPct)));

    await this.prisma.product.update({
      where: { id },
      data: updateData,
    });

    if (dto.activationGuide) {
      await this.prisma.activationGuide.upsert({
        where: { productId: id },
        create: {
          productId: id,
          steps: JSON.stringify(dto.activationGuide.steps || []),
          downloadUrl: dto.activationGuide.downloadUrl || null,
          notes: dto.activationGuide.notes || null,
          videoUrl: dto.activationGuide.videoUrl || null,
        },
        update: {
          steps: JSON.stringify(dto.activationGuide.steps || []),
          downloadUrl: dto.activationGuide.downloadUrl || null,
          notes: dto.activationGuide.notes || null,
          videoUrl: dto.activationGuide.videoUrl || null,
        },
      });
    }

    await this.invalidateCatalog();
    return this.findOne(id);
  }

  async remove(id: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Orders reference the product with Restrict — remove them (and their
        // commissions, which hold only a loose orderId ref) before deleting.
        const orders = await tx.order.findMany({ where: { productId: id }, select: { id: true } });
        const orderIds = orders.map((o) => o.id);
        if (orderIds.length > 0) {
          await tx.commission.deleteMany({ where: { orderId: { in: orderIds } } });
          await tx.order.deleteMany({ where: { id: { in: orderIds } } });
        }
        // Unlink any home cards pointing at this product so the storefront
        // never links to a dead product page.
        await tx.homeCard.updateMany({
          where: { productId: id },
          data: { productId: null, linkType: 'none' },
        });
        // LicenseKeys + ActivationGuide cascade with the product.
        await tx.product.delete({ where: { id } });
      });
    } catch (err: any) {
      if (err?.code === 'P2025') throw new NotFoundException('Product not found');
      throw err;
    }
    await this.invalidateCatalog();
    return { success: true, id };
  }

  async getCategories() {
    return this.cache.wrap(`${CATALOG_PREFIX}categories`, CATS_TTL, () =>
      this.prisma.category.findMany({
        include: {
          _count: { select: { products: true } },
        },
      }),
    );
  }

  async createCategory(name: string, icon: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const category = await this.prisma.category.create({
      data: { name, slug, icon },
    });
    await this.invalidateCatalog();
    return category;
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private formatProduct(p: any, includeEconomics = false) {
    return {
      ...p,
      costUSD: includeEconomics ? p.costUSD : undefined,
      supplierProductId: includeEconomics ? p.supplierProductId : undefined,
      marginMultiplier: includeEconomics ? p.marginMultiplier : undefined,
      priceMode: includeEconomics ? p.priceMode : undefined,
      source: includeEconomics ? p.source : undefined,
      gallery: this.parseJson<string[]>(p.gallery, []),
      features: this.parseJson<string[]>(p.features, []),
      requirements: this.parseJson<string[]>(p.requirements, []),
      translations: this.parseJson<ProductTranslations>(p.translations, {}),
      activationGuide: p.activationGuide
        ? {
            ...p.activationGuide,
            steps: this.parseJson<string[]>(p.activationGuide.steps, []),
          }
        : null,
    };
  }
}
