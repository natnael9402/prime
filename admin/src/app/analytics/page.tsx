'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminNavbar from '@/components/AdminNavbar';
import { api } from '@/lib/api';
import {
  BarChart3,
  TrendingUp,
  ShoppingBag,
  Users,
  Sparkles,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  CreditCard,
} from 'lucide-react';

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || delta === undefined) return null;
  const pos = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black ${
        pos ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
      }`}
    >
      {pos ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
      {pos ? '+' : ''}{delta}%
    </span>
  );
}

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setData(await api.getAnalyticsDashboard(range));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const series: any[] = data?.dailySeries || [];
  const maxRev = Math.max(1, ...series.map((d) => d.revenue));

  return (
    <div className="min-h-screen flex flex-col">
      <AdminNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap fade-up">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              Analytics &amp; Conversion Intelligence
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              AOV, average orders per buyer, repeat buyer rate, bot view-to-buy conversion funnel, and search demand.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl bg-white/5 p-1 border border-white/10">
              {(['7d', '30d', '90d', 'all'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase ${
                    range === r ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <button onClick={load} className="btn-ghost w-9 h-9 rounded-xl flex items-center justify-center text-slate-400">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div className="py-24 text-center text-xs text-slate-500">Computing analytics…</div>
        ) : data && (
          <>
            {/* Headline KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 fade-up">
              <div className="glass rounded-2xl p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Revenue</span>
                  <DeltaBadge delta={data.kpis.revenueDeltaPct} />
                </div>
                <div className="text-lg font-black text-emerald-300">{data.kpis.revenue.toLocaleString()} ETB</div>
                <div className="text-[10px] text-slate-500">ARPU: {data.kpis.arpu.toLocaleString()} ETB</div>
              </div>

              <div className="glass rounded-2xl p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">AOV</span>
                  <DeltaBadge delta={data.kpis.aovDeltaPct} />
                </div>
                <div className="text-lg font-black text-amber-300">{data.kpis.aov.toLocaleString()} ETB</div>
                <div className="text-[10px] text-slate-500">Average Order Value</div>
              </div>

              <div className="glass rounded-2xl p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Paid Orders</span>
                  <DeltaBadge delta={data.kpis.ordersDeltaPct} />
                </div>
                <div className="text-lg font-black text-white">{data.kpis.paidOrders.toLocaleString()}</div>
                <div className="text-[10px] text-slate-500">
                  {data.kpis.pendingOrders} pending · {data.kpis.rewardOrders} rewards
                </div>
              </div>

              <div className="glass rounded-2xl p-4 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Avg Orders / Buyer</span>
                <div className="text-lg font-black text-sky-300">{data.kpis.avgOrdersPerBuyer}</div>
                <div className="text-[10px] text-slate-500">{data.kpis.uniqueBuyers} unique buyers</div>
              </div>

              <div className="glass rounded-2xl p-4 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Conversion Rate</span>
                <div className="text-lg font-black text-purple-300">{data.funnel.overallConversionRate}%</div>
                <div className="text-[10px] text-slate-500">Buyers / Active users</div>
              </div>

              <div className="glass rounded-2xl p-4 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Repeat Buyer Rate</span>
                <div className="text-lg font-black text-emerald-300">{data.kpis.repeatBuyerRate}%</div>
                <div className="text-[10px] text-slate-500">{data.kpis.repeatBuyers} repeat buyers</div>
              </div>
            </div>

            {/* Chart + Funnel */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 fade-up">
              <div className="glass rounded-3xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" /> Daily Revenue &amp; Orders
                    </h2>
                    <p className="text-[10px] text-slate-500">
                      {hoverIdx !== null && series[hoverIdx]
                        ? `${series[hoverIdx].label}: ${series[hoverIdx].revenue.toLocaleString()} ETB · ${series[hoverIdx].orders} orders · ${series[hoverIdx].views} views`
                        : 'Hover bars to inspect daily revenue, orders, and product views'}
                    </p>
                  </div>
                </div>

                <div className="h-48 flex items-end gap-1 pt-4">
                  {series.map((d, idx) => {
                    const hPct = Math.max(4, Math.round((d.revenue / maxRev) * 100));
                    return (
                      <div
                        key={d.date}
                        onMouseEnter={() => setHoverIdx(idx)}
                        onMouseLeave={() => setHoverIdx(null)}
                        className="flex-1 h-full flex flex-col justify-end items-center group cursor-pointer"
                      >
                        <div
                          className={`w-full rounded-t-md transition-all ${
                            d.revenue > 0
                              ? hoverIdx === idx
                                ? 'bg-amber-400'
                                : 'bg-gradient-to-t from-emerald-500/60 to-amber-400/80'
                              : 'bg-white/5'
                          }`}
                          style={{ height: `${hPct}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[9px] text-slate-500 font-bold">
                  <span>{series[0]?.label}</span>
                  <span>{series[Math.floor(series.length / 2)]?.label}</span>
                  <span>{series[series.length - 1]?.label}</span>
                </div>
              </div>

              {/* Bot Conversion Funnel */}
              <div className="glass rounded-3xl p-5 space-y-4">
                <h2 className="text-sm font-black text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" /> Bot Conversion Funnel
                </h2>
                <div className="space-y-3">
                  {[
                    { label: 'Active Bot Users', count: data.funnel.activeUsers, base: data.funnel.activeUsers, color: 'bg-sky-500' },
                    { label: 'Viewed a Product', count: data.funnel.uniqueViewers, base: data.funnel.activeUsers, color: 'bg-indigo-500' },
                    { label: 'Clicked Buy Now', count: data.funnel.uniqueClickers, base: data.funnel.activeUsers, color: 'bg-amber-400' },
                    { label: 'Completed Payment', count: data.funnel.uniqueBuyers, base: data.funnel.activeUsers, color: 'bg-emerald-400' },
                  ].map((step) => {
                    const w = step.base > 0 ? Math.min(100, Math.round((step.count / step.base) * 100)) : 0;
                    return (
                      <div key={step.label} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-300 font-bold">{step.label}</span>
                          <span className="text-white font-black">
                            {step.count.toLocaleString()} <span className="text-slate-500">({w}%)</span>
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                          <div className={`h-full rounded-full ${step.color}`} style={{ width: `${Math.max(w, step.count > 0 ? 4 : 0)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-2 text-[10px]">
                  <div className="p-2.5 rounded-xl bg-white/[0.03]">
                    <div className="text-slate-500">View → Buy Click</div>
                    <div className="text-sm font-black text-amber-300">{data.funnel.viewToBuyClickRate}%</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.03]">
                    <div className="text-slate-500">Click → Paid Order</div>
                    <div className="text-sm font-black text-emerald-300">{data.funnel.checkoutConversionRate}%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Product Performance Table */}
            <div className="glass rounded-3xl overflow-hidden fade-up">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-sm font-black text-white flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-amber-400" /> Product Conversion &amp; Revenue
                </h2>
                <span className="text-[10px] text-slate-500 font-bold">{data.productPerformance.length} products</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                    <tr>
                      <th className="px-5 py-3">Product</th>
                      <th className="px-3 py-3 text-right">Views</th>
                      <th className="px-3 py-3 text-right">Buy Clicks</th>
                      <th className="px-3 py-3 text-right">CTR</th>
                      <th className="px-3 py-3 text-right">Paid Orders</th>
                      <th className="px-3 py-3 text-right">Conv %</th>
                      <th className="px-5 py-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.productPerformance.map((p: any) => (
                      <tr key={p.id} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3">
                          <div className="font-black text-white">{p.name}</div>
                          <div className="text-[10px] text-slate-500">{p.category} · {p.price} ETB · {p.stock} left</div>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-sky-300">{p.views}</td>
                        <td className="px-3 py-3 text-right font-bold text-amber-300">{p.buyClicks}</td>
                        <td className="px-3 py-3 text-right text-slate-400">{p.clickThroughRate}%</td>
                        <td className="px-3 py-3 text-right font-black text-white">{p.orders}</td>
                        <td className="px-3 py-3 text-right font-black text-emerald-300">{p.conversionRate}%</td>
                        <td className="px-5 py-3 text-right font-black text-emerald-300">{p.revenue.toLocaleString()} ETB</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Insights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 fade-up">
              {/* Payment Modes */}
              <div className="glass rounded-3xl p-5 space-y-3">
                <h2 className="text-sm font-black text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" /> Payment Methods
                </h2>
                {data.paymentModes.length === 0 ? (
                  <p className="text-xs text-slate-500">No paid orders in this window.</p>
                ) : (
                  <div className="space-y-2">
                    {data.paymentModes.map((m: any) => (
                      <div key={m.mode} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03]">
                        <div>
                          <div className="text-xs font-black text-white uppercase">{m.mode}</div>
                          <div className="text-[10px] text-slate-500">{m.count} orders</div>
                        </div>
                        <div className="text-xs font-black text-emerald-300">{m.revenue.toLocaleString()} ETB</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Search Queries */}
              <div className="glass rounded-3xl p-5 space-y-3">
                <h2 className="text-sm font-black text-white flex items-center gap-2">
                  <Search className="w-4 h-4 text-sky-400" /> Top Bot Searches
                </h2>
                {data.topSearches.length === 0 ? (
                  <p className="text-xs text-slate-500">No searches logged yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {data.topSearches.map((s: any) => (
                      <span
                        key={s.query}
                        className="px-2.5 py-1 rounded-xl bg-white/[0.04] border border-white/10 text-[11px] text-slate-200 font-bold"
                      >
                        {s.query} <span className="text-amber-300 ml-1">×{s.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Buyers */}
              <div className="glass rounded-3xl p-5 space-y-3">
                <h2 className="text-sm font-black text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" /> Top Buyers
                </h2>
                {data.topBuyers.length === 0 ? (
                  <p className="text-xs text-slate-500">No buyers in this window.</p>
                ) : (
                  <div className="space-y-2">
                    {data.topBuyers.map((b: any) => (
                      <Link
                        key={b.telegramId}
                        href={`/users/${encodeURIComponent(b.telegramId)}`}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06]"
                      >
                        <div>
                          <div className="text-xs font-black text-white">
                            {b.user?.firstName || b.user?.username || b.telegramId}
                          </div>
                          <div className="text-[10px] text-slate-500">{b.orders} orders</div>
                        </div>
                        <div className="text-xs font-black text-emerald-300">{b.totalSpent.toLocaleString()} ETB</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
