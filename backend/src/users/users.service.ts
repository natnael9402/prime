import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService, escapeHtml } from '../telegram/telegram.service';

export type UserEventType =
  | 'BOT_START'
  | 'CATEGORY_VIEW'
  | 'PRODUCT_VIEW'
  | 'SEARCH'
  | 'BUY_CLICK'
  | 'ORDER_PAID'
  | 'REWARD_CLAIM'
  | 'STOCK_ALERT';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  /** Fire-and-forget safe user activity tracker. */
  async trackEvent(input: {
    telegramId: string | number;
    eventType: UserEventType;
    productId?: string | null;
    productName?: string | null;
    categorySlug?: string | null;
    query?: string | null;
    orderId?: string | null;
    amount?: number | null;
    meta?: Record<string, any>;
  }) {
    try {
      const telegramId = String(input.telegramId);
      await Promise.all([
        this.prisma.userEvent.create({
          data: {
            telegramId,
            eventType: input.eventType,
            productId: input.productId || null,
            productName: input.productName || null,
            categorySlug: input.categorySlug || null,
            query: input.query ? input.query.slice(0, 120) : null,
            orderId: input.orderId || null,
            amount: input.amount ?? null,
            meta: input.meta ? JSON.stringify(input.meta) : null,
          },
        }),
        this.prisma.tgUser.updateMany({
          where: { telegramId },
          data: {
            lastActiveAt: new Date(),
            ...(input.eventType === 'PRODUCT_VIEW' ? { productsViewedCount: { increment: 1 } } : {}),
          },
        }),
      ]);
    } catch {
      // Never fail user flows because of analytics tracking
    }
  }

  async listUsers(params: {
    search?: string;
    filter?: string;
    page?: number;
    limit?: number;
    sort?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const take = Math.min(100, Math.max(1, params.limit || 25));
    const q = (params.search || '').trim();
    const filter = (params.filter || 'all').toLowerCase();

    const where: any = {};
    if (q) {
      where.OR = [
        { telegramId: { contains: q } },
        { username: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { referralCode: { contains: q } },
      ];
    }
    if (filter === 'banned') where.isBanned = true;
    if (filter === 'vip') {
      where.AND = [...(where.AND || []), { OR: [{ customDiscountPct: { gt: 0 } }, { storeCredit: { gt: 0 } }] }];
    }

    // Fetch buyer telegramIds if filtering by buyers
    if (filter === 'buyers') {
      const buyerRows = await this.prisma.order.findMany({
        where: { status: 'PAID', telegramUserId: { not: null } },
        select: { telegramUserId: true },
        distinct: ['telegramUserId'],
      });
      where.telegramId = { in: buyerRows.map((b) => b.telegramUserId!).filter(Boolean) };
    }

    const orderBy: any =
      params.sort === 'views'
        ? { productsViewedCount: 'desc' }
        : params.sort === 'credit'
          ? { storeCredit: 'desc' }
          : params.sort === 'newest'
            ? { createdAt: 'desc' }
            : { lastActiveAt: 'desc' };

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);

    const [rows, total, totalUsers, bannedUsers, active24h, paidBuyersDistinct] = await Promise.all([
      this.prisma.tgUser.findMany({
        where,
        orderBy,
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.tgUser.count({ where }),
      this.prisma.tgUser.count(),
      this.prisma.tgUser.count({ where: { isBanned: true } }),
      this.prisma.tgUser.count({ where: { lastActiveAt: { gte: dayAgo } } }),
      this.prisma.order.findMany({
        where: { status: 'PAID', telegramUserId: { not: null } },
        select: { telegramUserId: true },
        distinct: ['telegramUserId'],
      }),
    ]);

    const ids = rows.map((u) => u.telegramId);
    const [orderStats, inviteStats] = ids.length
      ? await Promise.all([
          this.prisma.order.groupBy({
            by: ['telegramUserId'],
            where: { telegramUserId: { in: ids }, status: 'PAID' },
            _sum: { amount: true },
            _count: { _all: true },
          }),
          this.prisma.tgUser.groupBy({
            by: ['invitedById'],
            where: { invitedById: { in: ids }, inviteVerified: true },
            _count: { _all: true },
          }),
        ])
      : [[], []];

    const orderMap = new Map(
      orderStats.map((r) => [r.telegramUserId, { orders: r._count._all, spent: r._sum.amount || 0 }]),
    );
    const inviteMap = new Map(inviteStats.map((r) => [r.invitedById, r._count._all]));

    return {
      users: rows.map((u) => {
        const o = orderMap.get(u.telegramId) || { orders: 0, spent: 0 };
        return {
          ...u,
          paidOrders: o.orders,
          totalSpent: o.spent,
          verifiedInvites: inviteMap.get(u.telegramId) || 0,
        };
      }),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / take)),
      summary: {
        totalUsers,
        bannedUsers,
        active24h,
        buyersCount: paidBuyersDistinct.length,
      },
    };
  }

  async getUserDetail(telegramIdOrId: string) {
    const user = await this.prisma.tgUser.findFirst({
      where: { OR: [{ telegramId: telegramIdOrId }, { id: telegramIdOrId }] },
    });
    if (!user) throw new NotFoundException('User not found');

    const tid = user.telegramId;

    const [
      orders,
      recentEvents,
      viewGroups,
      buyClicksCount,
      invitees,
      invitedBy,
      rewardClaims,
      stockAlerts,
      affiliate,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: { telegramUserId: tid },
        include: { product: { select: { id: true, name: true, bannerUrl: true, emojiId: true, price: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userEvent.findMany({
        where: { telegramId: tid },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.userEvent.groupBy({
        by: ['productId'],
        where: { telegramId: tid, eventType: 'PRODUCT_VIEW', productId: { not: null } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.userEvent.count({
        where: { telegramId: tid, eventType: 'BUY_CLICK' },
      }),
      this.prisma.tgUser.findMany({
        where: { invitedById: tid },
        select: {
          telegramId: true,
          firstName: true,
          lastName: true,
          username: true,
          inviteVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      user.invitedById
        ? this.prisma.tgUser.findUnique({
            where: { telegramId: user.invitedById },
            select: { telegramId: true, firstName: true, lastName: true, username: true },
          })
        : null,
      this.prisma.rewardClaim.findMany({
        where: { telegramUserId: tid },
        include: { tier: { include: { product: { select: { id: true, name: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockAlert.findMany({
        where: { telegramUserId: tid },
        include: { product: { select: { id: true, name: true, stock: true, price: true } } },
      }),
      this.prisma.affiliate.findFirst({ where: { telegramUserId: tid } }),
    ]);

    const viewedProductIds = viewGroups.map((v) => v.productId!).filter(Boolean);
    const viewedProductsMeta = viewedProductIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: viewedProductIds } },
          select: { id: true, name: true, price: true, stock: true, bannerUrl: true },
        })
      : [];
    const prodMap = new Map(viewedProductsMeta.map((p) => [p.id, p]));

    const productsViewed = viewGroups
      .map((v) => ({
        productId: v.productId!,
        views: v._count._all,
        lastViewedAt: v._max.createdAt,
        product: prodMap.get(v.productId!) || null,
      }))
      .sort((a, b) => b.views - a.views);

    const paidOrders = orders.filter((o) => o.status === 'PAID');
    const totalSpent = paidOrders.reduce((s, o) => s + o.amount, 0);
    const aov = paidOrders.length > 0 ? Math.round((totalSpent / paidOrders.length) * 100) / 100 : 0;
    const totalProductViews = viewGroups.reduce((s, v) => s + v._count._all, 0) || user.productsViewedCount;
    const conversionRate =
      totalProductViews > 0
        ? Math.round((paidOrders.length / totalProductViews) * 1000) / 10
        : paidOrders.length > 0
          ? 100
          : 0;

    return {
      user,
      metrics: {
        totalOrders: orders.length,
        paidOrders: paidOrders.length,
        pendingOrders: orders.filter((o) => o.status === 'PENDING').length,
        totalSpent,
        aov,
        productsViewedCount: Math.max(user.productsViewedCount, totalProductViews),
        uniqueProductsViewed: productsViewed.length,
        buyClicksCount,
        conversionRate,
        verifiedInvites: invitees.filter((i) => i.inviteVerified).length,
        totalInvites: invitees.length,
      },
      invitedBy,
      invitees,
      orders,
      productsViewed,
      recentEvents,
      rewardClaims,
      stockAlerts,
      affiliate,
    };
  }

  async updateUser(
    telegramId: string,
    dto: {
      isBanned?: boolean;
      banReason?: string | null;
      adminNote?: string | null;
      customDiscountPct?: number;
      storeCredit?: number;
      languageCode?: string;
    },
  ) {
    const existing = await this.prisma.tgUser.findUnique({ where: { telegramId } });
    if (!existing) throw new NotFoundException('User not found');

    const data: any = {};
    if (dto.isBanned !== undefined) data.isBanned = !!dto.isBanned;
    if (dto.banReason !== undefined) data.banReason = dto.banReason?.trim() || null;
    if (dto.adminNote !== undefined) data.adminNote = dto.adminNote?.trim() || null;
    if (dto.customDiscountPct !== undefined) {
      data.customDiscountPct = Math.min(95, Math.max(0, Number(dto.customDiscountPct) || 0));
    }
    if (dto.storeCredit !== undefined) {
      data.storeCredit = Math.max(0, Math.round((Number(dto.storeCredit) || 0) * 100) / 100);
    }
    if (dto.languageCode !== undefined && ['en', 'am'].includes(dto.languageCode)) {
      data.languageCode = dto.languageCode;
    }

    return this.prisma.tgUser.update({ where: { telegramId }, data });
  }

  async adjustCredit(
    telegramId: string,
    dto: { delta: number; reason?: string; notify?: boolean },
  ) {
    const existing = await this.prisma.tgUser.findUnique({ where: { telegramId } });
    if (!existing) throw new NotFoundException('User not found');
    const delta = Number(dto.delta);
    if (!Number.isFinite(delta) || delta === 0) {
      throw new BadRequestException('Provide a non-zero credit delta');
    }
    const nextCredit = Math.max(0, Math.round(((existing.storeCredit || 0) + delta) * 100) / 100);
    const updated = await this.prisma.tgUser.update({
      where: { telegramId },
      data: { storeCredit: nextCredit },
    });

    if (dto.notify && delta > 0) {
      void this.telegram.sendMessage(
        telegramId,
        `💰 <b>Store Credit Added!</b>\n\n` +
          `+<b>${delta.toLocaleString()} ETB</b> has been credited to your account.` +
          (dto.reason ? `\n📝 ${escapeHtml(dto.reason)}` : '') +
          `\n\nNew Balance: <b>${nextCredit.toLocaleString()} ETB</b>`,
      );
    }
    return updated;
  }

  async sendDirectMessage(telegramId: string, text: string) {
    const clean = (text || '').trim();
    if (!clean) throw new BadRequestException('Message text is required');
    const existing = await this.prisma.tgUser.findUnique({ where: { telegramId } });
    if (!existing) throw new NotFoundException('User not found');

    const res = await this.telegram.sendMessage(
      telegramId,
      `📩 <b>Message from Store Support</b>\n\n${escapeHtml(clean)}`,
    );
    return { sent: !!res?.ok };
  }
}
