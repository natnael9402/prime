import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AnalyticsRange = '7d' | '30d' | '90d' | 'all';

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(rangeInput: string = '30d') {
    const range: AnalyticsRange = ['7d', '30d', '90d', 'all'].includes(rangeInput)
      ? (rangeInput as AnalyticsRange)
      : '30d';

    const now = new Date();
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 30;
    const since =
      range === 'all' ? null : new Date(now.getTime() - days * 24 * 3600 * 1000);
    const prevSince =
      since ? new Date(since.getTime() - days * 24 * 3600 * 1000) : null;

    const orderWhere: any = since ? { createdAt: { gte: since } } : {};
    const eventWhere: any = since ? { createdAt: { gte: since } } : {};

    const [
      orders,
      prevPaidOrders,
      events,
      totalUsers,
      newUsers,
      activeUsersCount,
      products,
      allPaidBuyerStats,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere,
        select: {
          id: true,
          productId: true,
          telegramUserId: true,
          customerName: true,
          amount: true,
          status: true,
          paymentMode: true,
          fulfillmentStatus: true,
          createdAt: true,
        },
      }),
      prevSince && since
        ? this.prisma.order.findMany({
            where: { status: 'PAID', createdAt: { gte: prevSince, lt: since } },
            select: { amount: true },
          })
        : Promise.resolve([]),
      this.prisma.userEvent.findMany({
        where: eventWhere,
        select: {
          telegramId: true,
          eventType: true,
          productId: true,
          query: true,
          createdAt: true,
        },
      }),
      this.prisma.tgUser.count(),
      this.prisma.tgUser.count({ where: since ? { createdAt: { gte: since } } : {} }),
      this.prisma.tgUser.count({ where: since ? { lastActiveAt: { gte: since } } : {} }),
      this.prisma.product.findMany({
        select: { id: true, name: true, price: true, stock: true, category: { select: { name: true } } },
      }),
      this.prisma.order.groupBy({
        by: ['telegramUserId'],
        where: { status: 'PAID', telegramUserId: { not: null }, ...(since ? { createdAt: { gte: since } } : {}) },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    const paidOrders = orders.filter((o) => o.status === 'PAID');
    const pendingOrders = orders.filter((o) => o.status === 'PENDING');
    const failedFulfillments = paidOrders.filter((o) => o.fulfillmentStatus === 'FAILED');

    // Exclude 0 ETB free reward orders from paid revenue/AOV averages (track separately)
    const cashPaidOrders = paidOrders.filter((o) => o.paymentMode !== 'reward' && o.amount > 0);
    const rewardOrders = paidOrders.filter((o) => o.paymentMode === 'reward');

    const revenue = Math.round(cashPaidOrders.reduce((s, o) => s + o.amount, 0) * 100) / 100;
    const prevRevenue = Math.round(prevPaidOrders.reduce((s, o) => s + o.amount, 0) * 100) / 100;

    const aov = cashPaidOrders.length > 0 ? Math.round((revenue / cashPaidOrders.length) * 100) / 100 : 0;
    const prevAov =
      prevPaidOrders.length > 0 ? Math.round((prevRevenue / prevPaidOrders.length) * 100) / 100 : 0;

    const uniqueBuyers = allPaidBuyerStats.length;
    const avgOrdersPerBuyer =
      uniqueBuyers > 0 ? Math.round((paidOrders.length / uniqueBuyers) * 100) / 100 : 0;
    const repeatBuyers = allPaidBuyerStats.filter((b) => b._count._all >= 2).length;
    const repeatBuyerRate = pct(repeatBuyers, uniqueBuyers);

    const arpuBase = Math.max(activeUsersCount, totalUsers, 1);
    const arpu = Math.round((revenue / arpuBase) * 100) / 100;

    // Funnel metrics
    const viewEvents = events.filter((e) => e.eventType === 'PRODUCT_VIEW');
    const buyClickEvents = events.filter((e) => e.eventType === 'BUY_CLICK');
    const searchEvents = events.filter((e) => e.eventType === 'SEARCH' && e.query);

    const uniqueViewers = new Set(viewEvents.map((e) => e.telegramId)).size;
    const uniqueClickers = new Set(buyClickEvents.map((e) => e.telegramId)).size;
    const funnelActiveUsers = Math.max(activeUsersCount, uniqueViewers, uniqueBuyers);

    const viewToBuyClickRate = pct(buyClickEvents.length, viewEvents.length);
    const checkoutCompletionRate = pct(cashPaidOrders.length, buyClickEvents.length);
    const overallConversionRate = pct(uniqueBuyers, funnelActiveUsers);

    // Daily time-series (for chart)
    const chartDays = range === 'all' ? 30 : days;
    const seriesMap = new Map<
      string,
      { date: string; label: string; revenue: number; orders: number; views: number; buyClicks: number; newUsers: number }
    >();
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
      const k = dayKey(d);
      seriesMap.set(k, {
        date: k,
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: 0,
        orders: 0,
        views: 0,
        buyClicks: 0,
        newUsers: 0,
      });
    }

    for (const o of cashPaidOrders) {
      const slot = seriesMap.get(dayKey(o.createdAt));
      if (slot) {
        slot.revenue += o.amount;
        slot.orders += 1;
      }
    }
    for (const e of viewEvents) {
      const slot = seriesMap.get(dayKey(e.createdAt));
      if (slot) slot.views += 1;
    }
    for (const e of buyClickEvents) {
      const slot = seriesMap.get(dayKey(e.createdAt));
      if (slot) slot.buyClicks += 1;
    }

    const usersCreatedInWindow = await this.prisma.tgUser.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - chartDays * 24 * 3600 * 1000) } },
      select: { createdAt: true },
    });
    for (const u of usersCreatedInWindow) {
      const slot = seriesMap.get(dayKey(u.createdAt));
      if (slot) slot.newUsers += 1;
    }

    // Per-product conversion & revenue
    const viewsByProd = new Map<string, number>();
    const clicksByProd = new Map<string, number>();
    for (const e of viewEvents) {
      if (e.productId) viewsByProd.set(e.productId, (viewsByProd.get(e.productId) || 0) + 1);
    }
    for (const e of buyClickEvents) {
      if (e.productId) clicksByProd.set(e.productId, (clicksByProd.get(e.productId) || 0) + 1);
    }
    const ordersByProd = new Map<string, { count: number; revenue: number }>();
    for (const o of cashPaidOrders) {
      const cur = ordersByProd.get(o.productId) || { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += o.amount;
      ordersByProd.set(o.productId, cur);
    }

    const productPerformance = products
      .map((p) => {
        const views = viewsByProd.get(p.id) || 0;
        const buyClicks = clicksByProd.get(p.id) || 0;
        const ord = ordersByProd.get(p.id) || { count: 0, revenue: 0 };
        return {
          id: p.id,
          name: p.name,
          category: p.category?.name || '-',
          price: p.price,
          stock: p.stock,
          views,
          buyClicks,
          orders: ord.count,
          revenue: Math.round(ord.revenue * 100) / 100,
          clickThroughRate: pct(buyClicks, views),
          conversionRate: pct(ord.count, views),
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.views - a.views);

    // Payment mode breakdown
    const modeMap = new Map<string, { mode: string; count: number; revenue: number }>();
    for (const o of paidOrders) {
      const m = o.paymentMode || 'unknown';
      const cur = modeMap.get(m) || { mode: m, count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += o.amount;
      modeMap.set(m, cur);
    }

    // Top search queries
    const searchCounts = new Map<string, number>();
    for (const s of searchEvents) {
      const q = (s.query || '').trim().toLowerCase();
      if (q) searchCounts.set(q, (searchCounts.get(q) || 0) + 1);
    }
    const topSearches = [...searchCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([query, count]) => ({ query, count }));

    // Top buyers leaderboard
    const topBuyerRows = [...allPaidBuyerStats]
      .sort((a, b) => (b._sum.amount || 0) - (a._sum.amount || 0))
      .slice(0, 8);
    const topBuyerIds = topBuyerRows.map((b) => b.telegramUserId!).filter(Boolean);
    const topBuyerProfiles = topBuyerIds.length
      ? await this.prisma.tgUser.findMany({
          where: { telegramId: { in: topBuyerIds } },
          select: { telegramId: true, firstName: true, lastName: true, username: true },
        })
      : [];
    const tbMap = new Map(topBuyerProfiles.map((u) => [u.telegramId, u]));
    const topBuyers = topBuyerRows.map((b) => ({
      telegramId: b.telegramUserId!,
      orders: b._count._all,
      totalSpent: Math.round((b._sum.amount || 0) * 100) / 100,
      user: tbMap.get(b.telegramUserId!) || null,
    }));

    return {
      range,
      kpis: {
        revenue,
        revenueDeltaPct: range === 'all' ? null : pctDelta(revenue, prevRevenue),
        paidOrders: cashPaidOrders.length,
        rewardOrders: rewardOrders.length,
        pendingOrders: pendingOrders.length,
        failedFulfillments: failedFulfillments.length,
        ordersDeltaPct: range === 'all' ? null : pctDelta(cashPaidOrders.length, prevPaidOrders.length),
        aov,
        aovDeltaPct: range === 'all' ? null : pctDelta(aov, prevAov),
        uniqueBuyers,
        avgOrdersPerBuyer,
        repeatBuyers,
        repeatBuyerRate,
        arpu,
        totalUsers,
        newUsers,
        activeUsers: activeUsersCount,
      },
      funnel: {
        activeUsers: funnelActiveUsers,
        uniqueViewers,
        uniqueClickers,
        uniqueBuyers,
        productViews: viewEvents.length,
        buyClicks: buyClickEvents.length,
        paidOrders: cashPaidOrders.length,
        viewToBuyClickRate,
        checkoutCompletionRate,
        overallConversionRate,
      },
      dailySeries: [...seriesMap.values()],
      productPerformance,
      paymentModes: [...modeMap.values()],
      topSearches,
      topBuyers,
    };
  }
}
