'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AdminNavbar from '@/components/AdminNavbar';
import { api } from '@/lib/api';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  CreditCard,
  Eye,
  Gift,
  MessageSquare,
  Save,
  Send,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
  Activity,
} from 'lucide-react';

const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

export default function AdminUserDetailPage() {
  const params = useParams();
  const telegramId = decodeURIComponent(String(params?.id || ''));

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'orders' | 'views' | 'timeline' | 'invites'>('orders');

  // Controls
  const [vipDiscount, setVipDiscount] = useState('0');
  const [languageCode, setLanguageCode] = useState('en');
  const [adminNote, setAdminNote] = useState('');
  const [banReason, setBanReason] = useState('');
  const [savingControls, setSavingControls] = useState(false);

  // Credit adjust
  const [creditDelta, setCreditDelta] = useState('100');
  const [creditReason, setCreditReason] = useState('');
  const [creditNotify, setCreditNotify] = useState(true);
  const [adjustingCredit, setAdjustingCredit] = useState(false);

  // Direct DM
  const [dmText, setDmText] = useState('');
  const [sendingDm, setSendingDm] = useState(false);

  const load = useCallback(async () => {
    if (!telegramId) return;
    try {
      setLoading(true);
      const res = await api.getUserDetail(telegramId);
      setData(res);
      setVipDiscount(String(res.user.customDiscountPct || 0));
      setLanguageCode(res.user.languageCode || 'en');
      setAdminNote(res.user.adminNote || '');
      setBanReason(res.user.banReason || '');
    } finally {
      setLoading(false);
    }
  }, [telegramId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveControls = async (overrideBan?: boolean) => {
    try {
      setSavingControls(true);
      await api.updateUser(data.user.telegramId, {
        customDiscountPct: Number(vipDiscount) || 0,
        languageCode,
        adminNote,
        banReason,
        ...(overrideBan !== undefined ? { isBanned: overrideBan } : {}),
      });
      await load();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to update user');
    } finally {
      setSavingControls(false);
    }
  };

  const handleAdjustCredit = async (sign: 1 | -1) => {
    const val = Math.abs(Number(creditDelta) || 0) * sign;
    if (!val) return;
    try {
      setAdjustingCredit(true);
      await api.adjustUserCredit(data.user.telegramId, {
        delta: val,
        reason: creditReason.trim() || undefined,
        notify: sign > 0 ? creditNotify : false,
      });
      setCreditReason('');
      await load();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Credit adjustment failed');
    } finally {
      setAdjustingCredit(false);
    }
  };

  const handleSendDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dmText.trim()) return;
    try {
      setSendingDm(true);
      const res = await api.sendUserMessage(data.user.telegramId, dmText.trim());
      if (res.sent) {
        setDmText('');
        alert('Message sent to user on Telegram!');
      } else {
        alert('Telegram did not confirm delivery (bot token disabled or user blocked bot).');
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Send failed');
    } finally {
      setSendingDm(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <AdminNavbar />
        <div className="flex-1 flex items-center justify-center text-xs text-slate-500">Loading user 360° profile…</div>
      </div>
    );
  }

  if (!data?.user) {
    return (
      <div className="min-h-screen flex flex-col">
        <AdminNavbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <p className="text-sm text-slate-400">User not found</p>
          <Link href="/users" className="btn-ghost px-4 py-2 rounded-xl text-xs font-bold">
            ← Back to Users
          </Link>
        </div>
      </div>
    );
  }

  const { user, metrics, orders, productsViewed, recentEvents, invitedBy, invitees, rewardClaims, affiliate } = data;
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.telegramId;

  return (
    <div className="min-h-screen flex flex-col">
      <AdminNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Top bar */}
        <div className="flex items-start justify-between gap-4 flex-wrap fade-up">
          <div className="flex items-center gap-3">
            <Link
              href="/users"
              className="btn-ghost w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-white">{displayName}</h1>
                {user.username && <span className="text-xs text-sky-400 font-bold">@{user.username}</span>}
                {user.isBanned ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-black">
                    BANNED
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-black">
                    ACTIVE
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                <span>ID: <code>{user.telegramId}</code></span>
                <span>Invite Code: <code>{user.referralCode || '—'}</code></span>
                <span>Joined: {fmtDate(user.createdAt)}</span>
                <span>Last Active: {fmtDate(user.lastActiveAt)}</span>
                {invitedBy && (
                  <span>
                    Invited by:{' '}
                    <Link href={`/users/${encodeURIComponent(invitedBy.telegramId)}`} className="text-amber-300 underline">
                      {invitedBy.firstName || invitedBy.username || invitedBy.telegramId}
                    </Link>
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => saveControls(!user.isBanned)}
            disabled={savingControls}
            className={`px-4 py-2 rounded-xl text-xs font-black border flex items-center gap-1.5 ${
              user.isBanned
                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
            }`}
          >
            {user.isBanned ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
            {user.isBanned ? 'Unban User' : 'Ban User'}
          </button>
        </div>

        {/* User KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 fade-up">
          {[
            { label: 'Total Spent', value: `${metrics.totalSpent.toLocaleString()} ETB`, Icon: CreditCard, tone: 'text-emerald-300' },
            { label: 'Paid Orders', value: `${metrics.paidOrders} (${metrics.pendingOrders} pend)`, Icon: ShoppingBag, tone: 'text-white' },
            { label: 'Avg Order (AOV)', value: `${metrics.aov.toLocaleString()} ETB`, Icon: TrendingUp, tone: 'text-amber-300' },
            { label: 'Products Viewed', value: `${metrics.productsViewedCount} (${metrics.uniqueProductsViewed} uniq)`, Icon: Eye, tone: 'text-sky-300' },
            { label: 'Conversion', value: `${metrics.conversionRate}%`, Icon: Sparkles, tone: 'text-purple-300' },
            { label: 'Verified Invites', value: `${metrics.verifiedInvites} / ${metrics.totalInvites}`, Icon: Users, tone: 'text-emerald-300' },
          ].map(({ label, value, Icon, tone }) => (
            <div key={label} className="glass rounded-2xl p-3.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</span>
                <Icon className={`w-3.5 h-3.5 ${tone}`} />
              </div>
              <div className={`text-sm font-black ${tone}`}>{value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
          {/* Control Panel */}
          <div className="space-y-4 fade-up">
            <div className="glass rounded-3xl p-5 space-y-3">
              <h2 className="text-sm font-black text-white">User Controls</h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    VIP Discount (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={95}
                    value={vipDiscount}
                    onChange={(e) => setVipDiscount(e.target.value)}
                    className="input-dark w-full rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Bot Language
                  </label>
                  <select
                    value={languageCode}
                    onChange={(e) => setLanguageCode(e.target.value)}
                    className="input-dark w-full rounded-xl px-3 py-2 text-xs"
                  >
                    <option value="en">English</option>
                    <option value="am">Amharic (አማርኛ)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Ban Reason (shown if banned)
                </label>
                <input
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Optional reason…"
                  className="input-dark w-full rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Admin Notes (internal)
                </label>
                <textarea
                  rows={2}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="VIP reseller, fraud check, etc."
                  className="input-dark w-full rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <button
                onClick={() => saveControls()}
                disabled={savingControls}
                className="btn-primary w-full rounded-xl py-2 text-xs font-black flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" /> Save Controls
              </button>
            </div>

            {/* Store Credit */}
            <div className="glass rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-white">Store Credit</h2>
                <span className="text-sm font-black text-emerald-300">
                  {Number(user.storeCredit || 0).toLocaleString()} ETB
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={1}
                  value={creditDelta}
                  onChange={(e) => setCreditDelta(e.target.value)}
                  placeholder="Amount ETB"
                  className="input-dark rounded-xl px-3 py-2 text-xs"
                />
                <input
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="input-dark rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <input
                  type="checkbox"
                  checked={creditNotify}
                  onChange={(e) => setCreditNotify(e.target.checked)}
                />
                Notify user on Telegram when adding credit
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleAdjustCredit(1)}
                  disabled={adjustingCredit}
                  className="px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-black"
                >
                  + Add Credit
                </button>
                <button
                  onClick={() => handleAdjustCredit(-1)}
                  disabled={adjustingCredit}
                  className="px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-black"
                >
                  - Deduct
                </button>
              </div>
            </div>

            {/* Direct DM */}
            <form onSubmit={handleSendDm} className="glass rounded-3xl p-5 space-y-3">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-400" />
                Direct Telegram DM
              </h2>
              <textarea
                rows={3}
                value={dmText}
                onChange={(e) => setDmText(e.target.value)}
                placeholder="Write a direct message to this user via the bot…"
                className="input-dark w-full rounded-xl px-3 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={sendingDm || !dmText.trim()}
                className="btn-ghost w-full rounded-xl py-2 text-xs font-black border border-sky-500/30 text-sky-300 flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Send DM via Bot
              </button>
            </form>
          </div>

          {/* Right: Activity & History Tabs */}
          <div className="glass rounded-3xl overflow-hidden fade-up">
            <div className="flex items-center gap-1 p-3 border-b border-white/10 overflow-x-auto">
              {[
                { id: 'orders', label: `Orders (${orders.length})` },
                { id: 'views', label: `Products Viewed (${productsViewed.length})` },
                { id: 'timeline', label: `Activity Log (${recentEvents.length})` },
                { id: 'invites', label: `Invites & Rewards (${invitees.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black whitespace-nowrap ${
                    tab === t.id
                      ? 'bg-amber-400/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4 max-h-[75vh] overflow-y-auto space-y-2.5">
              {tab === 'orders' && (
                orders.length === 0 ? (
                  <p className="py-12 text-center text-xs text-slate-500">No orders yet.</p>
                ) : (
                  orders.map((o: any) => (
                    <div key={o.id} className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-white">
                          {o.product?.name || 'Product'} ×{o.quantity}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                            o.status === 'PAID'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {o.status} · {o.fulfillmentStatus}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span><code>{o.txRef}</code> · {o.paymentMode}</span>
                        <span className="font-black text-white">{o.amount.toLocaleString()} {o.currency}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">{fmtDate(o.createdAt)}</div>
                    </div>
                  ))
                )
              )}

              {tab === 'views' && (
                productsViewed.length === 0 ? (
                  <p className="py-12 text-center text-xs text-slate-500">No product views recorded yet.</p>
                ) : (
                  productsViewed.map((pv: any) => (
                    <div key={pv.productId} className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/5">
                      <div>
                        <div className="text-xs font-black text-white">
                          {pv.product?.name || pv.productId}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Last viewed: {fmtDate(pv.lastViewedAt)}
                          {pv.product ? ` · ${pv.product.price} ETB · ${pv.product.stock} in stock` : ''}
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-xl bg-sky-500/15 text-sky-300 text-xs font-black">
                        {pv.views} view{pv.views === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))
                )
              )}

              {tab === 'timeline' && (
                recentEvents.length === 0 ? (
                  <p className="py-12 text-center text-xs text-slate-500">No activity events yet.</p>
                ) : (
                  recentEvents.map((ev: any) => (
                    <div key={ev.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[11px] font-black text-white">{ev.eventType}</span>
                          <span className="text-[11px] text-slate-400 ml-2 truncate">
                            {ev.productName || ev.query || ev.categorySlug || (ev.amount ? `${ev.amount} ETB` : '')}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">{fmtDate(ev.createdAt)}</span>
                    </div>
                  ))
                )
              )}

              {tab === 'invites' && (
                <div className="space-y-4">
                  {affiliate && (
                    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs">
                      <div className="font-black text-amber-300">Affiliate Partner · Code: {affiliate.code}</div>
                      <div className="text-slate-300 mt-1">
                        Rate: {Math.round(affiliate.commissionRate * 100)}% · Clicks: {affiliate.clicks} · Status: {affiliate.status}
                      </div>
                    </div>
                  )}
                  <div>
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      Invited Friends ({invitees.length})
                    </h3>
                    {invitees.length === 0 ? (
                      <p className="text-xs text-slate-500">Has not invited anyone yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {invitees.map((inv: any) => (
                          <Link
                            key={inv.telegramId}
                            href={`/users/${encodeURIComponent(inv.telegramId)}`}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06]"
                          >
                            <span className="text-xs font-bold text-white">
                              {inv.firstName || inv.username || inv.telegramId}
                            </span>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${inv.inviteVerified ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                              {inv.inviteVerified ? 'VERIFIED' : 'PENDING'}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      Reward Claims ({rewardClaims.length})
                    </h3>
                    {rewardClaims.length === 0 ? (
                      <p className="text-xs text-slate-500">No reward claims yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {rewardClaims.map((rc: any) => (
                          <div key={rc.id} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <Gift className="w-3.5 h-3.5 text-emerald-400" /> {rc.tier?.title}
                            </span>
                            <span className="text-[10px] font-black text-amber-300">{rc.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
