'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminNavbar from '@/components/AdminNavbar';
import { api } from '@/lib/api';
import {
  LayoutDashboard, Banknote, ShoppingCart, Key, Package, Plus, RefreshCw,
  HandCoins, Clock, FlaskConical, ArrowRight, Settings2, Check,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [mode, setMode] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ usdToEtb: 200, marginMultiplier: 3, globalDiscountPct: 0 });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const [data, m, s] = await Promise.all([
        api.getAdminStats(),
        api.getPaymentMode().catch(() => null),
        api.getSettings().catch(() => null),
      ]);
      setStats(data);
      setMode(m);
      if (s) setSettings(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      const updated = await api.updateSettings({
        usdToEtb: Number(settings.usdToEtb),
        marginMultiplier: Number(settings.marginMultiplier),
        globalDiscountPct: Number(settings.globalDiscountPct),
      });
      setSettings(updated);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Save failed');
    } finally {
      setSavingSettings(false);
    }
  };

  const cards = [
    {
      label: 'Total Revenue',
      value: `${stats?.totalRevenue?.toLocaleString() ?? 0} ETB`,
      icon: Banknote,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: 'Completed Sales',
      value: `${stats?.paidOrdersCount ?? 0} / ${stats?.totalOrders ?? 0}`,
      icon: ShoppingCart,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
    },
    {
      label: 'Keys In Stock',
      value: stats?.availableKeysCount ?? 0,
      icon: Key,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10 border-sky-500/20',
    },
    {
      label: 'Active Products',
      value: stats?.totalProducts ?? 0,
      icon: Package,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10 border-violet-500/20',
    },
    {
      label: 'Affiliates',
      value: stats?.affiliatesCount ?? 0,
      icon: HandCoins,
      color: 'text-pink-400',
      bg: 'bg-pink-500/10 border-pink-500/20',
    },
    {
      label: 'Pending Payouts',
      value: `${stats?.pendingCommissions?.toLocaleString() ?? 0} ETB`,
      icon: Clock,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10 border-orange-500/20',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <AdminNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 fade-up">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-amber-400" />
              <span>Overview</span>
              {mode?.testMode && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/25 text-[9px] font-bold uppercase tracking-wide">
                  <FlaskConical className="w-3 h-3" />
                  Test Mode
                </span>
              )}
            </h1>
            <p className="text-[11px] text-slate-500">Revenue, sales, key inventory and affiliate program at a glance.</p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/products" className="btn-primary px-4 py-2 rounded-xl text-[11px] font-black flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>New Product</span>
            </Link>
            <Link href="/orders" className="btn-ghost px-4 py-2 rounded-xl text-[11px] font-bold text-slate-300">
              Orders
            </Link>
            <Link href="/affiliates" className="btn-ghost px-4 py-2 rounded-xl text-[11px] font-bold text-slate-300">
              Affiliates
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="py-24 flex items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* PRICING ENGINE */}
            <form onSubmit={handleSaveSettings} className="fade-up glass rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-white flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-amber-400" />
                  Pricing Engine
                </h2>
                <span className="text-[10px] text-slate-500 font-semibold">
                  Sell price = cost ($) × rate × margin, minus discounts
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">$1 = ? ETB (rate)</label>
                  <input
                    type="number" min="1" step="1"
                    value={settings.usdToEtb}
                    onChange={(e) => setSettings({ ...settings, usdToEtb: Number(e.target.value) })}
                    className="w-full input-dark rounded-xl px-3 py-2.5 text-sm text-amber-300 font-black"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Profit margin (×)</label>
                  <input
                    type="number" min="1" step="0.1"
                    value={settings.marginMultiplier}
                    onChange={(e) => setSettings({ ...settings, marginMultiplier: Number(e.target.value) })}
                    className="w-full input-dark rounded-xl px-3 py-2.5 text-sm text-amber-300 font-black"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">Global discount (%)</label>
                  <input
                    type="number" min="0" max="95" step="1"
                    value={settings.globalDiscountPct}
                    onChange={(e) => setSettings({ ...settings, globalDiscountPct: Number(e.target.value) })}
                    className="w-full input-dark rounded-xl px-3 py-2.5 text-sm text-amber-300 font-black"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className={`py-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all ${
                    settingsSaved ? 'bg-emerald-500 text-white' : 'btn-primary'
                  }`}
                >
                  {savingSettings ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : settingsSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      Prices updated!
                    </>
                  ) : (
                    'Apply & reprice'
                  )}
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                Example: $1 cost → {(settings.usdToEtb * settings.marginMultiplier).toLocaleString()} ETB
                {settings.globalDiscountPct > 0 &&
                  ` → ${Math.round(settings.usdToEtb * settings.marginMultiplier * (1 - settings.globalDiscountPct / 100)).toLocaleString()} ETB after ${settings.globalDiscountPct}% off`}
                . Saving reprices every AUTO-priced product instantly.
              </p>
            </form>

            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {cards.map((c, idx) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.label}
                    className={`fade-up rounded-2xl border p-4 space-y-2 ${c.bg}`}
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                      <span>{c.label}</span>
                      <Icon className={`w-4 h-4 ${c.color}`} />
                    </div>
                    <div className="text-lg font-black text-white">{c.value}</div>
                  </div>
                );
              })}
            </div>

            {/* Recent orders */}
            <div className="glass rounded-3xl p-5 space-y-3 fade-up" style={{ animationDelay: '240ms' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-white">Recent Orders</h2>
                <Link href="/orders" className="text-[10px] font-bold text-amber-400 flex items-center gap-1 hover:gap-2 transition-all">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full table-base">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Product</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats?.recentOrders?.length === 0 && (
                      <tr><td colSpan={4} className="text-center text-slate-500 py-6">No orders yet</td></tr>
                    )}
                    {stats?.recentOrders?.map((o: any) => (
                      <tr key={o.id}>
                        <td>
                          <div className="font-bold text-slate-100">{o.customerName}</div>
                          <div className="text-[10px] text-slate-500">{o.customerEmail}</div>
                        </td>
                        <td>{o.product?.name}</td>
                        <td className="font-bold text-amber-400">{o.amount.toLocaleString()} {o.currency}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            o.status === 'PAID'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}>
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Inventory */}
            <div className="glass rounded-3xl p-5 space-y-3 fade-up" style={{ animationDelay: '320ms' }}>
              <h2 className="text-sm font-black text-white">Product Inventory</h2>
              <div className="overflow-x-auto">
                <table className="w-full table-base">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Keys</th>
                      <th>Sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats?.productsOverview?.map((prod: any) => (
                      <tr key={prod.id}>
                        <td className="font-bold text-slate-100">{prod.name}</td>
                        <td>{prod.category}</td>
                        <td className="font-bold text-amber-400">{prod.price.toLocaleString()} ETB</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            prod.stock > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                          }`}>
                            {prod.stock}
                          </span>
                        </td>
                        <td className="font-bold">{prod.totalSales}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
