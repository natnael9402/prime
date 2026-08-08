'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import { api } from '@/lib/api';
import { Package, KeyRound, Clock, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';
import { getTelegramUser, triggerHaptic } from '@/lib/telegram';
import { useT } from '@/lib/i18n';

const PAGE_SIZE = 8;

export default function MyOrdersPage() {
  const t = useT();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [noTelegram, setNoTelegram] = useState(false);

  useEffect(() => {
    const tgUser = getTelegramUser();
    if (tgUser?.id) {
      fetchOrders(tgUser.id.toString(), page);
    } else {
      setLoading(false);
      setNoTelegram(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const fetchOrders = async (telegramUserId: string, pageNum: number) => {
    try {
      setLoading(true);
      const data = await api.getMyOrders({ telegramUserId, page: pageNum, limit: PAGE_SIZE });
      setOrders(data.orders || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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
              {total > 0 ? `${total} ${t.orders}` : ''}
            </p>
          </div>
        </div>

        {noTelegram && (
          <p className="fade-up text-[10px] text-apptext-3 font-semibold text-center">
            Open this page from the Telegram app to see your orders.
          </p>
        )}

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
            <p className="text-apptext-2 font-bold text-sm">{t.noOrders}</p>
            <Link href="/" className="inline-block btn-primary px-5 py-2 rounded-xl text-[11px] font-black">
              {t.home}
            </Link>
          </div>
        ) : (
          <>
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="fade-up flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => { triggerHaptic('light'); setPage((p) => Math.max(p - 1, 1)); }}
                  disabled={page <= 1}
                  className="btn-ghost flex items-center gap-1 px-4 py-2 rounded-xl text-[11px] font-bold text-apptext disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  {t.back}
                </button>
                <span className="text-[11px] font-bold text-apptext-3">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => { triggerHaptic('light'); setPage((p) => Math.min(p + 1, totalPages)); }}
                  disabled={page >= totalPages}
                  className="btn-ghost flex items-center gap-1 px-4 py-2 rounded-xl text-[11px] font-bold text-apptext disabled:opacity-40"
                >
                  {t.next}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
