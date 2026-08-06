import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HomeCardInput {
  enabled?: boolean;
  order?: number;
  kind?: string;
  badgeText?: string | null;
  title?: string;
  subtitle?: string | null;
  icon?: string | null;
  linkType?: string;
  productId?: string | null;
  linkUrl?: string | null;
  animatedBorder?: boolean;
  priceText?: string | null;
  imageUrl?: string | null;
  borderStyle?: string | null;
}

const DEFAULT_CARDS: HomeCardInput[] = [
  {
    enabled: true,
    order: 0,
    kind: 'hero',
    badgeText: 'Original • Instant',
    title: 'Premium Digital Keys',
    subtitle: 'Instant delivery • Secure — Chapa',
    icon: 'sparkles',
    linkType: 'none',
    linkUrl: null,
    animatedBorder: true,
  },
  {
    enabled: true,
    order: 1,
    kind: 'promo',
    badgeText: null,
    title: 'Share your link → earn commission',
    subtitle: 'Earn 10% on every sale',
    icon: 'handcoins',
    linkType: 'url',
    linkUrl: '/affiliate',
    animatedBorder: false,
  },
];

@Injectable()
export class HomeCardsService implements OnModuleInit {
  private readonly logger = new Logger(HomeCardsService.name);

  constructor(private prisma: PrismaService) {}

  /** Seed the two default cards on first run so the storefront never renders empty. */
  async onModuleInit() {
    try {
      const count = await this.prisma.homeCard.count();
      if (count === 0) {
        await this.prisma.homeCard.createMany({ data: DEFAULT_CARDS as any[] });
        this.logger.log('Seeded default home cards (hero + affiliate promo).');
      }
    } catch (err: any) {
      this.logger.warn(`Home card seed skipped: ${err?.message || err}`);
    }
  }

  /** Attach linked product pricing (name/price/currency) to product-linked cards. */
  private async withProducts<T extends { linkType: string; productId: string | null }>(cards: T[]) {
    const ids = [...new Set(cards.filter((c) => c.linkType === 'product' && c.productId).map((c) => c.productId!))];
    if (ids.length === 0) return cards.map((c) => ({ ...c, product: null }));
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, price: true, originalPrice: true, currency: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return cards.map((c) => ({
      ...c,
      product: c.linkType === 'product' && c.productId ? byId.get(c.productId) || null : null,
    }));
  }

  /** Storefront: enabled cards only, ordered. */
  async listPublic() {
    const cards = await this.prisma.homeCard.findMany({
      where: { enabled: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return this.withProducts(cards);
  }

  /** Admin: everything. */
  async listAdmin() {
    const cards = await this.prisma.homeCard.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return this.withProducts(cards);
  }

  async create(data: HomeCardInput) {
    this.validate(data, true);
    return this.prisma.homeCard.create({ data: this.clean(data) as any });
  }

  async update(id: string, data: HomeCardInput) {
    const existing = await this.prisma.homeCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Home card not found');
    this.validate({ ...existing, ...data }, false);
    return this.prisma.homeCard.update({ where: { id }, data: this.clean(data) as any });
  }

  async remove(id: string) {
    const existing = await this.prisma.homeCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Home card not found');
    await this.prisma.homeCard.delete({ where: { id } });
    return { deleted: true };
  }

  private clean(data: HomeCardInput) {
    const out: any = {};
    if (data.enabled !== undefined) out.enabled = !!data.enabled;
    if (data.order !== undefined) out.order = Math.floor(Number(data.order) || 0);
    if (data.kind !== undefined) out.kind = data.kind === 'promo' ? 'promo' : 'hero';
    if (data.badgeText !== undefined) out.badgeText = data.badgeText?.trim() || null;
    if (data.title !== undefined) out.title = data.title!.trim();
    if (data.subtitle !== undefined) out.subtitle = data.subtitle?.trim() || null;
    if (data.icon !== undefined) out.icon = data.icon?.trim() || null;
    if (data.linkType !== undefined) out.linkType = ['product', 'url'].includes(data.linkType) ? data.linkType : 'none';
    if (data.productId !== undefined) out.productId = data.productId || null;
    if (data.linkUrl !== undefined) out.linkUrl = data.linkUrl?.trim() || null;
    if (data.animatedBorder !== undefined) out.animatedBorder = !!data.animatedBorder;
    if (data.priceText !== undefined) out.priceText = data.priceText?.trim() || null;
    if (data.imageUrl !== undefined) out.imageUrl = data.imageUrl?.trim() || null;
    if (data.borderStyle !== undefined) out.borderStyle = ['blue'].includes(data.borderStyle || '') ? data.borderStyle : null;
    return out;
  }

  private validate(data: HomeCardInput, requireTitle: boolean) {
    if (requireTitle && !data.title?.trim()) {
      throw new BadRequestException('Title is required');
    }
    if (data.linkType === 'product' && !data.productId) {
      throw new BadRequestException('Pick a product for product links');
    }
    if (data.linkType === 'url' && !data.linkUrl?.trim()) {
      throw new BadRequestException('Enter a URL for custom links');
    }
  }
}
