'use client';

import React, { useEffect, useState } from 'react';
import AdminNavbar from '@/components/AdminNavbar';
import { api } from '@/lib/api';
import { Gift, Plus, Trash2, Check, X, Users, Award, Clock, Loader2 } from 'lucide-react';

export default function AdminRewardsPage() {
  const [stats, setStats] = useState<any>(null);
  const [tiers, setTiers] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    title: '',
    description: '',
    requiredInvites: '15',
    rewardType: 'PRODUCT',
    productId: '',
    creditAmount: '250',
    autoDeliver: true,
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [s, t, c, p] = await Promise.all([
        api.getRewardStats(),
        api.getRewardTiers(),
        api.getRewardClaims(),
        api.getAdminProducts(),
      ]);
      setStats(s);
      setTiers(Array.isArray(t) ? t : []);
      setClaims(Array.isArray(c) ? c : []);
      const prods = Array.isArray(p) ? p : [];
      setProducts(prods);
      if (!form.productId && prods.length > 0) {
        setForm((f) => ({ ...f, productId: prods[0].id }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      setSaving(true);
      await api.createRewardTier({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        requiredInvites: Number(form.requiredInvites) || 15,
        rewardType: form.rewardType,
        productId: form.rewardType === 'PRODUCT' ? form.productId : null,
        creditAmount: form.rewardType === 'STORE_CREDIT' ? Number(form.creditAmount) : null,
        autoDeliver: form.autoDeliver,
      });
      setForm((f) => ({ ...f, title: '', description: '' }));
      await load();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to create reward milestone');
    } finally {
      setSaving(false);
    }
  };

  const toggleTier = async (tier: any) => {
    await api.updateRewardTier(tier.id, { enabled: !tier.enabled });
    load();
  };

  const deleteTier = async (id: string) => {
    if (!confirm('Delete this reward milestone?')) return;
    await api.deleteRewardTier(id);
    load();
  };

  const approveClaim = async (id: string) => {
    await api.approveRewardClaim(id);
    load();
  };

  const rejectClaim = async (id: string) => {
    await api.rejectRewardClaim(id);
    load();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AdminNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4 fade-up">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <Gift className="w-5 h-5 text-emerald-400" />
              Invite &amp; Unlock Rewards
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Set invite milestones (e.g. 15 invites → unlock a free product or store credit) for the Telegram bot.
            </p>
          </div>
          {stats?.requiredChannel && (
            <span className="px-3 py-1.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[10px] font-black">
              Channel Gate: {stats.requiredChannel}
            </span>
          )}
        </div>

        {/* KPIs */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 fade-up">
            {[
              { label: 'Bot Users', value: stats.totalUsers, Icon: Users, tone: 'text-white' },
              { label: 'Verified Invites', value: stats.verifiedInvites, Icon: Award, tone: 'text-emerald-300' },
              { label: 'Pending Channel', value: stats.pendingInvites, Icon: Clock, tone: 'text-amber-300' },
              { label: 'Claims / Pending', value: `${stats.claimsCount} / ${stats.pendingClaims}`, Icon: Gift, tone: 'text-sky-300' },
            ].map(({ label, value, Icon, tone }) => (
              <div key={label} className="glass rounded-2xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
                  <Icon className={`w-4 h-4 ${tone}`} />
                </div>
                <div>
                  <div className={`text-lg font-black ${tone}`}>{value}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
          {/* Create Milestone */}
          <form onSubmit={handleCreate} className="glass rounded-3xl p-5 space-y-4 h-fit fade-up">
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              New Milestone
            </h2>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Milestone Title
              </label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Canva Pro 1 Year Free"
                className="w-full input-dark rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Required Invites
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={form.requiredInvites}
                  onChange={(e) => setForm({ ...form, requiredInvites: e.target.value })}
                  className="w-full input-dark rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Reward Type
                </label>
                <select
                  value={form.rewardType}
                  onChange={(e) => setForm({ ...form, rewardType: e.target.value })}
                  className="w-full input-dark rounded-xl px-3 py-2 text-xs"
                >
                  <option value="PRODUCT">Free Product</option>
                  <option value="STORE_CREDIT">Store Credit (ETB)</option>
                </select>
              </div>
            </div>

            {form.rewardType === 'PRODUCT' ? (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Product to Unlock
                </label>
                <select
                  value={form.productId}
                  onChange={(e) => setForm({ ...form, productId: e.target.value })}
                  className="w-full input-dark rounded-xl px-3 py-2 text-xs"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.price} {p.currency} · {p.stock} left)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Credit Amount (ETB)
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.creditAmount}
                  onChange={(e) => setForm({ ...form, creditAmount: e.target.value })}
                  className="w-full input-dark rounded-xl px-3 py-2 text-xs"
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoDeliver}
                onChange={(e) => setForm({ ...form, autoDeliver: e.target.checked })}
                className="rounded border-white/20"
              />
              Auto-deliver immediately on claim (when in stock)
            </label>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full rounded-xl py-2.5 text-xs font-black flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Milestone
            </button>
          </form>

          {/* Milestones & Claims */}
          <div className="space-y-5 fade-up">
            <div className="glass rounded-3xl p-5 space-y-3">
              <h2 className="text-sm font-black text-white">Active Milestones ({tiers.length})</h2>
              {loading ? (
                <div className="py-10 text-center text-slate-500 text-xs">Loading…</div>
              ) : tiers.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs">
                  No milestones yet — create your first e.g. 15 invites reward on the left.
                </div>
              ) : (
                <div className="space-y-2">
                  {tiers.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-black">
                            {t.requiredInvites} Invites
                          </span>
                          <span className="text-xs font-black text-white">{t.title}</span>
                          {!t.enabled && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">Paused</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {t.rewardType === 'STORE_CREDIT'
                            ? `+${t.creditAmount} ETB Store Credit`
                            : `Product: ${t.product?.name || 'Manual'}`}{' '}
                          · {t.autoDeliver ? 'Auto-deliver' : 'Manual approval'} · {t._count?.claims || 0} claimed
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => toggleTier(t)}
                          className="btn-ghost px-2.5 py-1.5 rounded-xl text-[10px] font-bold"
                        >
                          {t.enabled ? 'Pause' : 'Enable'}
                        </button>
                        <button
                          onClick={() => deleteTier(t.id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass rounded-3xl p-5 space-y-3">
              <h2 className="text-sm font-black text-white">Recent Reward Claims ({claims.length})</h2>
              {claims.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">No reward claims yet.</div>
              ) : (
                <div className="space-y-2">
                  {claims.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5"
                    >
                      <div>
                        <div className="text-xs font-black text-white">
                          {c.user?.firstName || c.user?.username || c.telegramUserId}
                          <span className="text-slate-500 font-normal ml-1.5">
                            → {c.tier?.title} ({c.tier?.requiredInvites} invites)
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Status: <b className="text-amber-300">{c.status}</b>
                          {c.note ? ` · ${c.note}` : ''}
                        </div>
                      </div>
                      {c.status === 'PENDING' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => approveClaim(c.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> Approve &amp; Deliver
                          </button>
                          <button
                            onClick={() => rejectClaim(c.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-black flex items-center gap-1"
                          >
                            <X className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
