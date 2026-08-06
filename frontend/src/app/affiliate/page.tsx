'use client';

import React, { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import { api } from '@/lib/api';
import {
  HandCoins, Copy, Check, Share2, Rocket, RefreshCw, BadgeCheck,
  ArrowUpRight, Clock, Wallet,
} from 'lucide-react';
import {
  triggerHaptic, getTelegramUser, getAffiliateCode, storeAffiliateCode, shareToTelegram,
} from '@/lib/telegram';
import { useT } from '@/lib/i18n';

export default function AffiliatePage() {
  const t = useT();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [hasTelegram, setHasTelegram] = useState(true);

  useEffect(() => {
    setHasTelegram(!!getTelegramUser());
    const code = getAffiliateCode();
    if (code) {
      loadStats(code);
    } else {
      setLoading(false);
    }
  }, []);

  const loadStats = async (code: string) => {
    try {
      setLoading(true);
      const data = await api.getAffiliateStats(code);
      setStats(data);
      storeAffiliateCode(data.code);
    } catch (err) {
      console.error(err);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const tgUser = getTelegramUser();
    if (!tgUser) return;
    triggerHaptic('heavy');
    setJoining(true);
    setError('');
    try {
      const data = await api.joinAffiliate({
        name:
          `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() ||
          tgUser.username ||
          'Affiliate',
        telegramUserId: tgUser.id?.toString(),
        telegramUsername: tgUser.username,
        payoutMethod: 'telebirr',
      });
      storeAffiliateCode(data.code);
      setStats(data);
    } catch (err: any) {
      setError(err.response?.data?.message || t.errorGeneric);
    } finally {
      setJoining(false);
    }
  };

  const handleCopyLink = () => {
    if (!stats?.link) return;
    navigator.clipboard.writeText(stats.link);
    setCopied(true);
    triggerHaptic('heavy');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = () => {
    triggerHaptic('medium');
    shareToTelegram(t.shareMsg, stats?.link);
  };

  // ---------- DASHBOARD ----------
  if (stats) {
    const conversion = stats.clicks > 0 ? Math.round((stats.sales / stats.clicks) * 100) : 0;
    const commissions = [...(stats.commissions || [])].sort(
      (a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );

    return (
      <div className="app-shell flex flex-col">
        <Navbar />
        <main className="app-scroll pb-app-nav max-w-2xl w-full mx-auto px-4 sm:px-6 pt-5">

          {/* Header — name + rate, flat */}
          <div className="fade-up flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base font-black text-apptext truncate flex items-center gap-1.5">
                {stats.name}
                <BadgeCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[9px] font-black shrink-0">
                {Math.round(stats.commissionRate * 100)}%
              </span>
            </div>
            <button
              onClick={() => loadStats(stats.code)}
              className="btn-ghost p-2 rounded-xl text-apptext-2"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Hero number — total earned, huge and flat */}
          <div className="fade-up pt-6 pb-5 border-b border-apptext/10" style={{ animationDelay: '40ms' }}>
            <div className="text-[10px] font-black uppercase tracking-widest text-apptext-3">
              {t.totalEarned}
            </div>
            <div className="mt-1 text-5xl font-black text-gradient leading-none tracking-tight">
              {stats.totalEarned.toLocaleString()}
              <span className="text-lg font-black text-apptext-3 ml-1.5">ETB</span>
            </div>
            <div className="mt-3 flex items-center gap-4 text-[11px] font-bold">
              <span className="flex items-center gap-1.5 text-orange-400">
                <Clock className="w-3.5 h-3.5" />
                {stats.pending.toLocaleString()} {t.pendingEarnings.toLowerCase()}
              </span>
              <span className="w-1 h-1 rounded-full bg-apptext/20" />
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Wallet className="w-3.5 h-3.5" />
                {stats.paid.toLocaleString()} {t.paidEarnings.toLowerCase()}
              </span>
            </div>
          </div>

          {/* Stats strip — numbers with dividers, no boxes */}
          <div className="fade-up grid grid-cols-4 py-4 border-b border-apptext/10" style={{ animationDelay: '80ms' }}>
            {[
              { label: t.clicks, value: stats.clicks },
              { label: t.sales, value: stats.sales },
              { label: 'CVR', value: `${conversion}%` },
              { label: t.rate, value: `${Math.round(stats.commissionRate * 100)}%` },
            ].map((s, i) => (
              <div key={s.label} className={`text-center ${i > 0 ? 'border-l border-apptext/10' : ''}`}>
                <div className="text-lg font-black text-apptext">{s.value}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-apptext-3 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Referral link — flat underline row */}
          <div className="fade-up py-4 border-b border-apptext/10 space-y-2.5" style={{ animationDelay: '120ms' }}>
            <div className="text-[10px] font-black uppercase tracking-widest text-apptext-3">{t.yourLink}</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 text-[12px] font-mono text-brand-300 truncate border-b border-dashed border-apptext/20 pb-1.5">
                {stats.link}
              </div>
              <button
                onClick={handleCopyLink}
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                  copied ? 'bg-emerald-500 text-slate-950 scale-105' : 'bg-apptext/5 text-apptext border border-apptext/10'
                }`}
                aria-label={t.copy}
              >
                {copied ? <Check className="w-4 h-4 stroke-[3]" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={handleShare}
                className="w-10 h-10 rounded-xl btn-primary flex items-center justify-center shrink-0"
                aria-label={t.shareOnTelegram}
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Earnings feed — every sale, what it earned, its status */}
          <div className="fade-up pt-4 pb-6" style={{ animationDelay: '160ms' }}>
            <div className="text-[10px] font-black uppercase tracking-widest text-apptext-3 pb-1">
              {t.recentSales}
            </div>

            {commissions.length === 0 && (
              <div className="py-10 text-center space-y-2">
                <HandCoins className="w-8 h-8 text-apptext/20 mx-auto" />
                <p className="text-[11px] text-apptext-3 font-semibold">{t.noSalesYet}</p>
              </div>
            )}

            <div className="divide-y divide-apptext/8">
              {commissions.map((c: any) => {
                const paid = c.status === 'PAID';
                return (
                  <div key={c.id} className="flex items-center gap-3 py-3">
                    {c.productImage ? (
                      <img
                        src={c.productImage}
                        alt={c.product}
                        className="w-11 h-11 rounded-xl object-cover bg-apptext/5 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-apptext/5 flex items-center justify-center shrink-0">
                        <HandCoins className="w-5 h-5 text-apptext/30" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold text-apptext truncate">{c.product}</div>
                      <div className="flex items-center gap-1.5 text-[9px] text-apptext-3 font-semibold mt-0.5">
                        <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                        {c.orderAmount != null && (
                          <>
                            <span className="w-0.5 h-0.5 rounded-full bg-apptext/30" />
                            <span>{c.orderAmount.toLocaleString()} {c.currency}</span>
                          </>
                        )}
                        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase ${
                          paid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-orange-500/15 text-orange-400'
                        }`}>
                          {c.status}
                        </span>
                      </div>
                    </div>
                    <div className={`text-[13px] font-black shrink-0 flex items-center gap-0.5 ${paid ? 'text-emerald-400' : 'text-orange-400'}`}>
                      +{c.amount.toLocaleString()}
                      <span className="text-[9px] font-bold">{c.currency || 'ETB'}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  // ---------- JOIN ----------
  return (
    <div className="app-shell flex flex-col">
      <Navbar />
      <main className="app-scroll pb-app-nav max-w-md w-full mx-auto px-4 sm:px-6 pt-10">
        <div className="fade-up text-center space-y-3 pb-8 border-b border-apptext/10">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
            <HandCoins className="w-7 h-7 text-emerald-300" />
          </div>
          <h1 className="text-3xl font-black text-apptext tracking-tight">{t.becomeAffiliate}</h1>
          <p className="text-[12px] text-emerald-300/90 font-bold">{t.affiliateSub}</p>
        </div>

        <div className="fade-up divide-y divide-apptext/8" style={{ animationDelay: '60ms' }}>
          {[t.step1, t.step2, t.step3].map((step, i) => (
            <div key={i} className="flex items-center gap-3 py-3.5">
              <span className="w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-black flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="text-[12px] font-semibold text-apptext">{step}</span>
            </div>
          ))}
        </div>

        <div className="fade-up pt-8 space-y-3" style={{ animationDelay: '120ms' }}>

          {error && (
            <div className="px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] font-semibold">
              {error}
            </div>
          )}

          {hasTelegram ? (
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="btn-primary w-full py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2"
            >
              {joining ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t.joining}
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  {t.joinNow}
                </>
              )}
            </button>
          ) : (
            <div className="px-4 py-3.5 text-brand-300 text-[11px] font-bold text-center leading-relaxed border-t border-b border-apptext/10">
              {t.joinViaTelegram}
            </div>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-6">
            <RefreshCw className="w-5 h-5 animate-spin text-brand-400" />
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
