'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminNavbar from '@/components/AdminNavbar';
import { api } from '@/lib/api';
import {
  Users,
  Search,
  ShieldAlert,
  ShoppingBag,
  Eye,
  Sparkles,
  ChevronRight,
  Activity,
  ChevronLeft,
} from 'lucide-react';

const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'buyers' | 'vip' | 'banned'>('all');
  const [sort, setSort] = useState<'active' | 'views' | 'credit' | 'newest'>('active');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getUsers({ search: search.trim() || undefined, filter, page, limit: 25, sort });
      setUsers(res.users || []);
      setSummary(res.summary || null);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } finally {
      setLoading(false);
    }
  }, [search, filter, page, sort]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="min-h-screen flex flex-col">
      <AdminNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap fade-up">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-400" />
              Bot Users &amp; Control
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Inspect every Telegram user&apos;s orders, product views, invites, VIP discounts, credit, and ban status.
            </p>
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 fade-up">
            {[
              { label: 'Total Bot Users', value: summary.totalUsers, Icon: Users, tone: 'text-white' },
              { label: 'Active (24h)', value: summary.active24h, Icon: Activity, tone: 'text-emerald-300' },
              { label: 'Paying Buyers', value: summary.buyersCount, Icon: ShoppingBag, tone: 'text-amber-300' },
              { label: 'Banned', value: summary.bannedUsers, Icon: ShieldAlert, tone: 'text-rose-300' },
            ].map(({ label, value, Icon, tone }) => (
              <div key={label} className="glass rounded-2xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
                  <Icon className={`w-4 h-4 ${tone}`} />
                </div>
                <div>
                  <div className={`text-lg font-black ${tone}`}>{Number(value || 0).toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="glass rounded-2xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 fade-up">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search name, @username, Telegram ID, or invite code…"
              className="input-dark w-full rounded-xl pl-9 pr-3 py-2 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {([
              { id: 'all', label: 'All' },
              { id: 'buyers', label: 'Buyers' },
              { id: 'vip', label: 'VIP / Credit' },
              { id: 'banned', label: 'Banned' },
            ] as const).map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setPage(1);
                  setFilter(f.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-colors ${
                  filter === f.id
                    ? 'bg-amber-400/15 border-amber-500/40 text-amber-300'
                    : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <select
            value={sort}
            onChange={(e) => {
              setPage(1);
              setSort(e.target.value as any);
            }}
            className="input-dark rounded-xl px-3 py-2 text-xs"
          >
            <option value="active">Sort: Last Active</option>
            <option value="views">Sort: Most Views</option>
            <option value="credit">Sort: Store Credit</option>
            <option value="newest">Sort: Newest</option>
          </select>
        </div>

        {/* Users List */}
        <div className="glass rounded-3xl overflow-hidden fade-up">
          <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between text-[11px] font-bold text-slate-400">
            <span>Showing {users.length} of {total.toLocaleString()} users</span>
            <span>Page {page} / {totalPages}</span>
          </div>

          {loading ? (
            <div className="py-16 text-center text-xs text-slate-500">Loading users…</div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500">No users match your filters.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {users.map((u) => {
                const displayName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || u.telegramId;
                return (
                  <Link
                    key={u.telegramId}
                    href={`/users/${encodeURIComponent(u.telegramId)}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400/20 to-sky-500/20 border border-white/10 flex items-center justify-center font-black text-xs text-white shrink-0">
                        {(displayName[0] || 'U').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-white truncate">{displayName}</span>
                          {u.username && <span className="text-[10px] text-sky-400 font-bold">@{u.username}</span>}
                          {u.isBanned && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-black">
                              BANNED
                            </span>
                          )}
                          {u.customDiscountPct > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" /> VIP -{u.customDiscountPct}%
                            </span>
                          )}
                          {u.storeCredit > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-black">
                              {u.storeCredit} ETB Credit
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                          <span>ID: <code className="text-slate-400">{u.telegramId}</code></span>
                          <span>Lang: {(u.languageCode || 'en').toUpperCase()}</span>
                          <span>Last active: {fmtDate(u.lastActiveAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 shrink-0">
                      <div className="hidden md:flex items-center gap-5 text-right">
                        <div>
                          <div className="text-xs font-black text-white">{u.paidOrders || 0}</div>
                          <div className="text-[9px] text-slate-500 uppercase font-bold">Orders</div>
                        </div>
                        <div>
                          <div className="text-xs font-black text-emerald-300">
                            {Number(u.totalSpent || 0).toLocaleString()} ETB
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase font-bold">Spent</div>
                        </div>
                        <div>
                          <div className="text-xs font-black text-sky-300 flex items-center justify-end gap-1">
                            <Eye className="w-3 h-3" /> {u.productsViewedCount || 0}
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase font-bold">Views</div>
                        </div>
                        <div>
                          <div className="text-xs font-black text-amber-300">{u.verifiedInvites || 0}</div>
                          <div className="text-[9px] text-slate-500 uppercase font-bold">Invites</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-amber-300 transition-colors" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn-ghost px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="btn-ghost px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-40"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
