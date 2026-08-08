import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  async findOne(idOrTxRef: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ id: idOrTxRef }, { txRef: idOrTxRef }],
      },
      include: {
        product: {
          include: { activationGuide: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${idOrTxRef} not found`);
    }

    return {
      ...order,
      product: order.product ? {
        ...order.product,
        gallery: this.parseJson<string[]>(order.product.gallery, []),
        features: this.parseJson<string[]>(order.product.features, []),
        requirements: this.parseJson<string[]>(order.product.requirements, []),
        translations: this.parseJson<any>(order.product.translations, {}),
        activationGuide: order.product.activationGuide ? {
          ...order.product.activationGuide,
          steps: this.parseJson<string[]>(order.product.activationGuide.steps, []),
        } : null,
      } : null,
    };
  }

  async findAll(status?: string, page = 1, limit = 20) {
    const where: any = {};
    if (status && status !== 'all') {
      where.status = status.toUpperCase();
    }

    const take = Math.min(Math.max(limit, 1), 100);
    const currentPage = Math.max(page, 1);
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          product: {
            select: { id: true, name: true, price: true, currency: true, bannerUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * take,
        take,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { orders, total, page: currentPage, totalPages: Math.max(Math.ceil(total / take), 1) };
  }

  async findByCart(cartRef: string) {
    const orders = await this.prisma.order.findMany({
      where: { cartRef },
      include: {
        product: {
          include: { activationGuide: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return orders.map((order) => ({
      ...order,
      product: order.product ? {
        ...order.product,
        costUSD: undefined,
        supplierProductId: undefined,
        marginMultiplier: undefined,
        gallery: this.parseJson<string[]>(order.product.gallery, []),
        features: this.parseJson<string[]>(order.product.features, []),
        requirements: this.parseJson<string[]>(order.product.requirements, []),
        translations: this.parseJson<any>(order.product.translations, {}),
        activationGuide: order.product.activationGuide ? {
          ...order.product.activationGuide,
          steps: this.parseJson<string[]>(order.product.activationGuide.steps, []),
        } : null,
      } : null,
    }));
  }

  async findMine(params: { telegramUserId?: string; email?: string; page?: number; limit?: number }) {
    const where: any = { OR: [] };
    if (params.telegramUserId) where.OR.push({ telegramUserId: params.telegramUserId });
    if (params.email) where.OR.push({ customerEmail: params.email });
    if (where.OR.length === 0) return { orders: [], total: 0, page: 1, totalPages: 1 };

    const take = Math.min(Math.max(params.limit || 10, 1), 50);
    const currentPage = Math.max(params.page || 1, 1);
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          product: {
            select: { id: true, name: true, price: true, currency: true, bannerUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * take,
        take,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { orders, total, page: currentPage, totalPages: Math.max(Math.ceil(total / take), 1) };
  }

  async getAdminStats() {
    const totalOrders = await this.prisma.order.count();
    const paidOrders = await this.prisma.order.findMany({
      where: { status: 'PAID' },
    });
    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.amount, 0);
    const totalProducts = await this.prisma.product.count();
    const availableKeysCount = await this.prisma.licenseKey.count({
      where: { isUsed: false },
    });

    const recentOrders = await this.prisma.order.findMany({
      take: 8,
      include: {
        product: { select: { name: true, bannerUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const productsWithKeyStats = await this.prisma.product.findMany({
      include: {
        category: true,
        _count: {
          select: {
            licenseKeys: true,
            orders: true,
          },
        },
      },
    });

    const affiliatesCount = await this.prisma.affiliate.count();
    const commissions = await this.prisma.commission.findMany();
    const pendingCommissions = commissions
      .filter((c) => c.status === 'PENDING')
      .reduce((s, c) => s + c.amount, 0);
    const paidCommissions = commissions
      .filter((c) => c.status === 'PAID')
      .reduce((s, c) => s + c.amount, 0);

    return {
      totalRevenue,
      totalOrders,
      paidOrdersCount: paidOrders.length,
      totalProducts,
      availableKeysCount,
      affiliatesCount,
      pendingCommissions,
      paidCommissions,
      recentOrders,
      productsOverview: productsWithKeyStats.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category.name,
        price: p.price,
        stock: p.stock,
        totalSales: p._count.orders,
      })),
    };
  }
}
