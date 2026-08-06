import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class AffiliatesService {
  private cachedBotUsername: string | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private generateCode(name: string): string {
    const base = (name || 'KV')
      .replace(/[^a-zA-Z]/g, '')
      .substring(0, 3)
      .toUpperCase() || 'KV';
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return `${base}${suffix}`;
  }

  /** Bot handle from env, else live getMe (cached). Null when bot is unconfigured. */
  private async botUsername(): Promise<string | null> {
    const fromEnv = (this.config.get<string>('TELEGRAM_BOT_USERNAME') || '').replace(/^@/, '').trim();
    if (fromEnv) return fromEnv;
    if (this.cachedBotUsername) return this.cachedBotUsername;
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN') || '';
    if (!token || token.startsWith('mock') || token.length <= 20) return null;
    try {
      const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 8000 });
      const username = res.data?.result?.username;
      if (username) this.cachedBotUsername = username;
      return username || null;
    } catch {
      return null;
    }
  }

  /**
   * Referral links are Telegram deep links: they open the BOT, and the bot's
   * /start handler hands the friend a web-app button carrying ?ref=<code>.
   * Falls back to the raw storefront URL only when no bot is configured.
   */
  async referralLink(code: string, productId?: string): Promise<string> {
    const username = await this.botUsername();
    if (username) {
      const start = productId ? `ref_${code}_p_${productId}` : `ref_${code}`;
      return `https://t.me/${username}?start=${start}`;
    }
    const frontend = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    return productId ? `${frontend}/product/${productId}?ref=${code}` : `${frontend}/?ref=${code}`;
  }

  async join(dto: {
    name: string;
    phone?: string;
    email?: string;
    telegramUserId?: string;
    telegramUsername?: string;
    payoutMethod?: string;
    payoutAccount?: string;
  }) {
    if (!dto.name || dto.name.trim().length < 2) {
      throw new BadRequestException('Name is required');
    }

    // Returning user joins again -> hand back existing account
    if (dto.telegramUserId) {
      const existing = await this.prisma.affiliate.findFirst({
        where: { telegramUserId: dto.telegramUserId },
      });
      if (existing) {
        return this.getStats(existing.code);
      }
    }

    let code = this.generateCode(dto.name);
    for (let i = 0; i < 10; i++) {
      const clash = await this.prisma.affiliate.findUnique({ where: { code } });
      if (!clash) break;
      code = this.generateCode(dto.name);
    }

    const affiliate = await this.prisma.affiliate.create({
      data: {
        code,
        name: dto.name.trim(),
        phone: dto.phone || null,
        email: dto.email || null,
        telegramUserId: dto.telegramUserId || null,
        telegramUsername: dto.telegramUsername || null,
        payoutMethod: dto.payoutMethod || null,
        payoutAccount: dto.payoutAccount || null,
        status: 'ACTIVE',
      },
    });

    return this.getStats(affiliate.code);
  }

  async trackClick(code: string) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { code } });
    if (!affiliate) return { ok: false };
    await this.prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { clicks: { increment: 1 } },
    });
    return { ok: true, code };
  }

  async getStats(code: string) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { code },
      include: {
        commissions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!affiliate) throw new NotFoundException('Affiliate not found');

    const paidOrdersCount = await this.prisma.order.count({
      where: { affiliateId: affiliate.id, status: 'PAID' },
    });

    const pending = affiliate.commissions
      .filter((c) => c.status === 'PENDING')
      .reduce((s, c) => s + c.amount, 0);
    const paid = affiliate.commissions
      .filter((c) => c.status === 'PAID')
      .reduce((s, c) => s + c.amount, 0);

    const recentOrders = await this.prisma.order.findMany({
      where: { affiliateId: affiliate.id, status: 'PAID' },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true } } },
    });

    // Join each commission to its order so affiliates can see exactly
    // which product/sale earned them what.
    const commissionOrders = await this.prisma.order.findMany({
      where: { id: { in: affiliate.commissions.map((c) => c.orderId) } },
      include: { product: { select: { name: true, bannerUrl: true } } },
    });
    const orderById = new Map(commissionOrders.map((o) => [o.id, o]));

    return {
      code: affiliate.code,
      name: affiliate.name,
      status: affiliate.status,
      commissionRate: affiliate.commissionRate,
      clicks: affiliate.clicks,
      sales: paidOrdersCount,
      pending,
      paid,
      totalEarned: pending + paid,
      link: await this.referralLink(affiliate.code),
      payoutMethod: affiliate.payoutMethod,
      payoutAccount: affiliate.payoutAccount,
      commissions: affiliate.commissions.map((c) => {
        const order = orderById.get(c.orderId);
        return {
          id: c.id,
          amount: c.amount,
          rate: c.rate,
          status: c.status,
          createdAt: c.createdAt,
          paidAt: c.paidAt,
          product: order?.product?.name || 'Product',
          productImage: order?.product?.bannerUrl || null,
          orderAmount: order?.amount ?? null,
          currency: order?.currency || 'ETB',
        };
      }),
      recentSales: recentOrders.map((o) => ({
        id: o.id,
        product: o.product?.name,
        amount: o.amount,
        currency: o.currency,
        commission: o.commissionAmount,
        createdAt: o.createdAt,
      })),
      createdAt: affiliate.createdAt,
    };
  }

  /** Resolve an active affiliate from a referral code (used at checkout). */
  async resolveRefCode(refCode?: string) {
    if (!refCode) return null;
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { code: refCode.trim() },
    });
    if (!affiliate || affiliate.status !== 'ACTIVE') return null;
    return affiliate;
  }

  /** Create the commission once an order is PAID. Idempotent per order. */
  async createCommissionForOrder(order: {
    id: string;
    affiliateId?: string | null;
    amount: number;
  }) {
    if (!order.affiliateId) return null;
    const existing = await this.prisma.commission.findUnique({
      where: { orderId: order.id },
    });
    if (existing) return existing;

    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: order.affiliateId },
    });
    if (!affiliate) return null;

    const amount = Math.round(order.amount * affiliate.commissionRate * 100) / 100;
    const commission = await this.prisma.commission.create({
      data: {
        affiliateId: affiliate.id,
        orderId: order.id,
        amount,
        rate: affiliate.commissionRate,
        status: 'PENDING',
      },
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { commissionAmount: amount },
    });

    return commission;
  }

  // ---------- Admin ----------

  async adminList() {
    const affiliates = await this.prisma.affiliate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        commissions: true,
        _count: { select: { orders: true } },
      },
    });

    return affiliates.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      phone: a.phone,
      email: a.email,
      telegramUsername: a.telegramUsername,
      status: a.status,
      commissionRate: a.commissionRate,
      clicks: a.clicks,
      ordersCount: a._count.orders,
      pending: a.commissions.filter((c) => c.status === 'PENDING').reduce((s, c) => s + c.amount, 0),
      paid: a.commissions.filter((c) => c.status === 'PAID').reduce((s, c) => s + c.amount, 0),
      payoutMethod: a.payoutMethod,
      payoutAccount: a.payoutAccount,
      createdAt: a.createdAt,
    }));
  }

  async adminCommissions(status?: string) {
    const where: any = {};
    if (status && status !== 'all') where.status = status.toUpperCase();

    const commissions = await this.prisma.commission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { affiliate: true },
    });

    const orders = await this.prisma.order.findMany({
      where: { id: { in: commissions.map((c) => c.orderId) } },
      include: { product: { select: { name: true } } },
    });
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    return commissions.map((c) => ({
      id: c.id,
      amount: c.amount,
      rate: c.rate,
      status: c.status,
      createdAt: c.createdAt,
      paidAt: c.paidAt,
      affiliate: {
        id: c.affiliate.id,
        code: c.affiliate.code,
        name: c.affiliate.name,
        payoutMethod: c.affiliate.payoutMethod,
        payoutAccount: c.affiliate.payoutAccount,
      },
      order: orderMap.get(c.orderId)
        ? {
            id: orderMap.get(c.orderId)!.id,
            txRef: orderMap.get(c.orderId)!.txRef,
            product: orderMap.get(c.orderId)!.product?.name,
            amount: orderMap.get(c.orderId)!.amount,
            customerName: orderMap.get(c.orderId)!.customerName,
          }
        : null,
    }));
  }

  async markCommissionPaid(id: string) {
    const commission = await this.prisma.commission.findUnique({ where: { id } });
    if (!commission) throw new NotFoundException('Commission not found');
    return this.prisma.commission.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date() },
    });
  }

  async cancelCommission(id: string) {
    const commission = await this.prisma.commission.findUnique({ where: { id } });
    if (!commission) throw new NotFoundException('Commission not found');
    return this.prisma.commission.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async updateAffiliate(
    id: string,
    dto: { status?: string; commissionRate?: number; payoutMethod?: string; payoutAccount?: string },
  ) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { id } });
    if (!affiliate) throw new NotFoundException('Affiliate not found');
    const data: any = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.commissionRate !== undefined) data.commissionRate = Number(dto.commissionRate);
    if (dto.payoutMethod !== undefined) data.payoutMethod = dto.payoutMethod;
    if (dto.payoutAccount !== undefined) data.payoutAccount = dto.payoutAccount;
    return this.prisma.affiliate.update({ where: { id }, data });
  }
}
