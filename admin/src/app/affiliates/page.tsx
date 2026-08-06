'use client';

import React, { useEffect, useState } from 'react';
import AdminNavbar from '@/components/AdminNavbar';
import { api } from '@/lib/api';
import {
  HandCoins, RefreshCw, Users, Banknote, CheckCircle2, XCircle, Clock, Percent,
} from 'lucide-react';

export default function AdminAffiliatesPage() {
  const [tab, setTab] = useState<'affiliates' | 'commissions'>('affiliates');
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [commissionFilter, setCommissionFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, commissionFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (tab === 'affiliates') {
        setAffiliates(await api.getAdminAffiliates());
      } else {
        setCommissions(await api.getAdminCommissions(commissionFilter));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async (id: string) => {
    try {
      setActionId(id);
      await api.payCommission(id);
      await loadData();
    } catch {
      alert('Payout update failed');
    } finally {
      setActionId(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this commission?')) return;
    try {
      setActionId(id);
      await api.cancelCommission(id);
      await loadData();
    } finally {
      setActionId(null);
    }
  };

  const handleToggleStatus = async (a: any) => {
    const next = a.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      setActionId(a.id);
      await api.updateAffiliate(a.id, { status: next });
      await loadData();
    } finally {
      setActionId(null);
    }
  };

  const handleRateChange = async (a: any, rateStr: string) => {
    const rate = parseFloat(rateStr);
    if (isNaN(rate) || rate < 0 || rate > 1) return;
    try {
      await api.updateAffiliate(a.id, { commissionRate: rate });
      await loadData();
    } catch {
      alert('Rate update failed');
    }
  };

  const totals = {
    pending: commissions.filter((c) => c.status === 'PENDING').reduce((s, c) => s + c.amount, 0),
    paid: commissions.filter((c) => c.status === 'PAID').reduce((s, c) => s + c.amount, 0),
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AdminNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 fade-up">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <HandCoins className="w-5 h-5 text-emerald-400" />
              Affiliate Program
            </h1>
            <p className="text-[11px] text-slate-500">Partners, referral performance and commission payouts.</p>
          </div>

          <div className="flex items-center gap-1.5">
            {[
              { id: 'affiliates', label: 'Affiliates', icon: Users },
              { id: 'commissions', label: 'Payouts', icon: Banknote },
            ].map((tb) => {
              const Icon = tb.icon;
              const active = tab === (tb.id as any);
              return (
                <button
                  key={tb.id}
                  onClick={() => setTab(tb.id as any)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-white/[0.03] text-slate-500 border-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tb.label}
                </button>
              );
            })}
          </div>
        </div>

        {tab === 'commissions' && (
          <div className="flex flex-wrap items-center gap-2 fade-up">
            <div className="glass rounded-xl px-3.5 py-2 flex items-center gap-2 text-[11px]">
              <Clock className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-slate-400 font-bold">Pending:</span>
              <span className="font-black text-orange-300">{totals.pending.toLocaleString()} ETB</span>
            </div>
            <div className="glass rounded-xl px-3.5 py-2 flex items-center gap-2 text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400 font-bold">Paid:</span>
              <span className="font-black text-emerald-300">{totals.paid.toLocaleString()} ETB</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              {['all', 'PENDING', 'PAID', 'CANCELLED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setCommissionFilter(st)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase border ${
                    commissionFilter === st
                      ? 'bg-amber-400/15 text-amber-300 border-amber-500/30'
                      : 'bg-white/[0.03] text-slate-500 border-white/10 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-24 flex justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
          </div>
        ) : tab === 'affiliates' ? (
          <div className="glass rounded-3xl overflow-hidden fade-up">
            <div className="overflow-x-auto">
              <table className="w-full table-base">
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Code</th>
                    <th>Rate</th>
                    <th>Clicks</th>
                    <th>Orders</th>
                    <th>Pending</th>
                    <th>Paid</th>
                    <th>Payout</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {affiliates.length === 0 && (
                    <tr><td colSpan={9} className="text-center text-slate-500 py-8">No affiliates yet</td></tr>
                  )}
                  {affiliates.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="font-bold text-slate-100">{a.name}</div>
                        <div className="text-[10px] text-slate-500">{a.phone || a.email || '—'}</div>
                        {a.telegramUsername && <div className="text-[10px] text-sky-400">@{a.telegramUsername}</div>}
                      </td>
                      <td className="font-mono font-bold text-amber-400">{a.code}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <Percent className="w-3 h-3 text-slate-500" />
                          <input
                            type="number"
                            defaultValue={Math.round(a.commissionRate * 100)}
                            min={0}
                            max={100}
                            onBlur={(e) => handleRateChange(a, (parseFloat(e.target.value) / 100).toString())}
                            className="w-14 input-dark rounded-lg px-1.5 py-1 text-[11px] text-slate-100"
                          />
                        </div>
                      </td>
                      <td>{a.clicks}</td>
                      <td className="font-bold">{a.ordersCount}</td>
                      <td className="font-bold text-orange-300">{a.pending.toLocaleString()}</td>
                      <td className="font-bold text-emerald-400">{a.paid.toLocaleString()}</td>
                      <td>
                        <div className="text-[10px] text-slate-400 uppercase font-bold">{a.payoutMethod || '—'}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{a.payoutAccount || ''}</div>
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleStatus(a)}
                          disabled={actionId === a.id}
                          className={`px-2.5 py-1 rounded-full font-bold text-[9px] uppercase border transition-colors ${
                            a.status === 'ACTIVE'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-rose-500/15 hover:text-rose-400 hover:border-rose-500/30'
                              : 'bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-500/30'
                          }`}
                        >
                          {a.status}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="glass rounded-3xl overflow-hidden fade-up">
            <div className="overflow-x-auto">
              <table className="w-full table-base">
                <thead>
                  <tr>
                    <th>Affiliate</th>
                    <th>Order</th>
                    <th>Sale</th>
                    <th>Commission</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-slate-500 py-8">No commissions found</td></tr>
                  )}
                  {commissions.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="font-bold text-slate-100">{c.affiliate.name}</div>
                        <div className="text-[10px] text-amber-400 font-mono">{c.affiliate.code}</div>
                        <div className="text-[10px] text-slate-500 uppercase">{c.affiliate.payoutMethod} {c.affiliate.payoutAccount}</div>
                      </td>
                      <td>
                        <div className="font-mono text-[10px] text-slate-400">{c.order?.txRef}</div>
                        <div className="text-[10px] text-slate-500">{c.order?.customerName}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="font-bold text-slate-200">{c.order?.product}</div>
                        <div className="text-[10px] text-slate-500">{c.order?.amount?.toLocaleString()} ETB</div>
                      </td>
                      <td className="font-black text-emerald-400 whitespace-nowrap">
                        {c.amount.toLocaleString()} ETB
                        <span className="text-[9px] text-slate-500 font-normal"> ({Math.round(c.rate * 100)}%)</span>
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${
                          c.status === 'PAID'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : c.status === 'PENDING'
                            ? 'bg-orange-500/15 text-orange-300'
                            : 'bg-slate-500/15 text-slate-400'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="text-[10px] text-slate-500 whitespace-nowrap">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        {c.status === 'PENDING' && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handlePay(c.id)}
                              disabled={actionId === c.id}
                              className="btn-success px-2.5 py-1 rounded-lg text-[9px] font-black flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Pay
                            </button>
                            <button
                              onClick={() => handleCancel(c.id)}
                              disabled={actionId === c.id}
                              className="px-2.5 py-1 rounded-lg text-[9px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/25 hover:bg-rose-500/20 flex items-center gap-1"
                            >
                              <XCircle className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {c.status === 'PAID' && c.paidAt && (
                          <span className="text-[9px] text-slate-500">{new Date(c.paidAt).toLocaleDateString()}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
