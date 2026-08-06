'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import { api } from '@/lib/api';
import { Package, RefreshCw, Search, KeyRound, Clock, CheckCircle2, ChevronRight } from 'lucide-react';
import { getTelegramUser, getBuyerEmail, storeBuyerEmail, triggerHaptic } from '@/lib/telegram';
import { useT } from '@/lib/i18n';

export default function MyOrdersPage() {
  const t = useT();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [needsEmail, setNeedsEmail] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const tgUser = getTelegramUser();
    const savedEmail = getBuyerEmail();
    if (tgUser?.id) {
      fetchOrders({ telegramUserId: tgUser.id.toString() });
    } else if (savedEmail) {
      setEmail(savedEmail);
      fetchOrders({ email: savedEmail });
    } else {
      setLoading(false);
      setNeedsEmail(true);
    }
  }, []);

  const fetchOrders = async (params: { telegramUserId?: string; email?: string }) => {
    try {
      setLoading(true);
      const data = await api.getMyOrders(params);
      setOrders(data);
      setSearched(true);
      setNeedsEmail(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    triggerHaptic('medium');
    storeBuyerEmail(email.trim());
    fetchOrders({ email: email.trim() });
  };

  return (
    <div className="app-shell flex flex-col">
      <Navbar />

      <main className="app-scroll pb-app-nav max-w-2xl w-full mx-auto px-3 sm:px-6 py-5 space-y-4">
        <div className="fade-up flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-400/15 border border-brand-400/25 flex items-center justify-center">
            <Package className="w-5 h-5 text-brand-300" />
          </div>
          <div>
            <h1 className="text-lg font-black text-apptext">{t.myOrders}</h1>
            <p className="text-[10px] text-apptext-3 font-semibold">
              {orders.length > 0 ? `${orders.length} ${t.orders}` : t.emailHint}
            </p>
          </div>
        </div>

        {/* Email lookup (when Telegram identity is unavailable) */}
        <form onSubmit={handleEmailSearch} className="fade-up flex gap-2" style={{ animationDelay: '50ms' }}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-apptext-3" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailHint}
              className="w-full input-dark rounded-xl pl-8 pr-3 py-2.5 text-xs text-apptext placeholder-apptext-3"
            />
          </div>
          <button type="submit" className="btn-primary px-4 py-2.5 rounded-xl text-[11px] font-black">
            {t.findOrders}
          </button>
        </form>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass rounded-2xl p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl skeleton" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 rounded skeleton" />
                  <div className="h-2.5 w-1/3 rounded skeleton" />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="fade-up glass rounded-3xl py-14 text-center space-y-3">
            <Package className="w-10 h-10 text-apptext-3 mx-auto" />
            <p className="text-apptext-2 font-bold text-sm">{searched || needsEmail ? t.noOrders : t.noOrders}</p>
            <Link href="/" className="inline-block btn-primary px-5 py-2 rounded-xl text-[11px] font-black">
              {t.home}
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {orders.map((o, idx) => {
              const isPaid = o.status === 'PAID';
              return (
                <Link
                  key={o.id}
                  href={`/order/${o.id}/activation?tx_ref=${o.txRef}`}
                  onClick={() => triggerHaptic('light')}
                  className="fade-up glass card-hover rounded-2xl p-3.5 flex items-center gap-3 group"
                  style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                >
                  {o.product?.bannerUrl ? (
                    <img src={o.product.bannerUrl} alt={o.product?.name} className="w-12 h-12 rounded-xl object-cover border border-apptext/10 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-apptext/5 flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5 text-apptext-3" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-bold text-apptext truncate group-hover:text-brand-300 transition-colors">
                        {o.product?.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-mono text-apptext-3 truncate">{o.txRef}</span>
                    </div>
                    <div className="text-[11px] font-black text-brand-400/90 mt-0.5">
                      {o.amount.toLocaleString()} {o.currency}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border ${
                        isPaid
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                          : 'bg-brand-500/10 text-brand-300 border-brand-500/25'
                      }`}
                    >
                      {isPaid ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                      {isPaid ? t.paid : t.pending}
                    </span>
                    {isPaid && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-brand-400/80">
                        <KeyRound className="w-2.5 h-2.5" />
                        {t.viewKey}
                      </span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-apptext-3 group-hover:text-brand-400 transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
