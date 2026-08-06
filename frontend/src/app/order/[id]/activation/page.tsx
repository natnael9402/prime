'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import { api } from '@/lib/api';
import confetti from 'canvas-confetti';
import {
  CheckCircle2, Download, ExternalLink, ShieldCheck, Zap, RefreshCw,
  AlertCircle, Check, CreditCard, Package,
} from 'lucide-react';
import { triggerHaptic, triggerNotificationHaptic } from '@/lib/telegram';
import { useLang, useT } from '@/lib/i18n';
import { localizedProductContent } from '@/lib/productContent';
import DeliveryContent from '@/components/DeliveryContent';
import Loading from '@/app/loading';

function OrderActivationInner() {
  const t = useT();
  const lang = useLang();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderId = params?.id as string;
  const txRef = searchParams?.get('tx_ref') || '';

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [completedSteps, setCompletedSteps] = useState<{ [key: string]: boolean }>({});
  const [confettiFired, setConfettiFired] = useState(false);

  useEffect(() => {
    if (orderId || txRef) fetchOrderDetails(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, txRef]);

  const fetchOrderDetails = async (initial = false) => {
    try {
      if (initial) setLoading(true);
      else setRefreshing(true);

      let data: any = null;
      if (txRef) data = await api.verifyPayment(txRef);
      else if (orderId) data = await api.getOrder(orderId);

      setOrder(data);

      const list: any[] = data ? (data.orders || [data]) : [];
      const allPaid = list.length > 0 && list.every((o) => o.status === 'PAID');
      if (allPaid && !confettiFired) {
        setConfettiFired(true);
        triggerNotificationHaptic('success');
        confetti({
          particleCount: 90,
          spread: 75,
          origin: { y: 0.6 },
          colors: ['#fbbf24', '#f59e0b', '#10b981', '#ffffff'],
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    triggerHaptic('heavy');
    setTimeout(() => setCopiedKey(''), 2500);
  };

  const toggleStep = (key: string) => {
    triggerHaptic('light');
    setCompletedSteps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return <Loading />;
  }

  if (!order) {
    return (
      <div className="app-shell flex flex-col">
        <Navbar />
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center gap-4">
          <AlertCircle className="w-12 h-12 text-rose-500" />
          <h1 className="text-base font-bold text-apptext">{t.errorGeneric}</h1>
          <button onClick={() => router.push('/')} className="btn-primary px-5 py-2 rounded-xl text-xs font-black">
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  const orders: any[] = order.orders || [order];
  const isPaid = orders.length > 0 && orders.every((o) => o.status === 'PAID');
  const isCart = orders.length > 1;
  const displayRef = order.cartRef || order.txRef || txRef;
  const totalAmount = orders.reduce((s, o) => s + (o.amount || 0), 0);
  const currency = orders[0]?.currency || 'ETB';
  const paymentUrl = order.paymentUrl || orders.find((o) => o.paymentUrl)?.paymentUrl;

  return (
    <div className="app-shell flex flex-col">
      <Navbar />

      <main className="app-scroll pb-app-nav max-w-2xl w-full mx-auto px-3 sm:px-6 py-6 space-y-5">
        {/* Status header */}
        <div className="text-center space-y-2 fade-up">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
              isPaid
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-brand-500/10 border-brand-500/30 text-brand-300'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{isPaid ? t.paid : t.pending}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-apptext">
            {isPaid ? t.paidSuccess : t.verifying}
          </h1>
          <p className="text-[11px] text-apptext-3 font-mono">
            {t.orderNo}: <span className="text-brand-400/90">{displayRef}</span>
          </p>
          {isCart && (
            <p className="text-[10px] text-apptext-3 font-bold">
              {orders.length} {t.items} • {totalAmount.toLocaleString()} {currency}
            </p>
          )}
        </div>

        {isPaid ? (
          <div className="space-y-5">
            {orders.map((ord, ordIdx) => {
              const rawProduct = ord.product;
              const product = rawProduct ? localizedProductContent(rawProduct, lang) : null;
              const guide = product?.activationGuide;

              return (
                <React.Fragment key={ord.id || ordIdx}>
                  {/* License key card */}
                  <div className="fade-up relative rounded-3xl glass overflow-hidden">
                    <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-32 bg-brand-500/15 blur-3xl rounded-full" />
                    <div className="relative p-5 sm:p-6 space-y-4">
                      <div className="flex items-center gap-3 pb-4 border-b border-apptext/5">
                        {product?.bannerUrl && (
                          <img
                            src={product.bannerUrl}
                            alt={product.name}
                            className="w-12 h-12 rounded-xl object-cover border border-apptext/10"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-[9px] font-black uppercase tracking-widest text-brand-400">{t.yourKey}</span>
                          <h2 className="text-sm font-bold text-apptext truncate">{product?.name}</h2>
                          <span className="text-[10px] text-apptext-3">
                            {ord.quantity > 1 ? `${ord.quantity} × ` : ''}
                            {ord.amount.toLocaleString()} {ord.currency}
                          </span>
                        </div>
                      </div>

                      <DeliveryContent
                        rawText={ord.licenseKey || ''}
                        copiedKey={copiedKey}
                        onCopy={handleCopyKey}
                        t={t}
                        loginTitle={(service) =>
                          lang === 'am' ? `${service} ${t.loginTo}` : `${t.loginTo} ${service}`
                        }
                      />
                    </div>
                  </div>

                  {/* Activation guide removed */}
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          /* PENDING — honest state: complete payment or refresh */
          <div className="fade-up glass rounded-3xl p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-brand-500/15 border border-brand-500/25 flex items-center justify-center mx-auto">
              <Package className="w-7 h-7 text-brand-300 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-black text-apptext">{t.pending}</h2>
              <p className="text-[11px] text-apptext-2 max-w-xs mx-auto leading-relaxed">{t.pendingHint}</p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              {paymentUrl && (
                <a
                  href={paymentUrl}
                  className="btn-primary w-full py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{t.payNowShort} • {totalAmount.toLocaleString()} {currency}</span>
                </a>
              )}
              <button
                onClick={() => fetchOrderDetails(false)}
                disabled={refreshing}
                className="btn-ghost w-full py-2.5 rounded-2xl text-[11px] font-bold text-apptext flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{t.checkStatus}</span>
              </button>
            </div>

            <div className="flex items-center justify-center gap-1.5 pt-2 text-[10px] text-apptext-3 font-semibold">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>{t.paymentMethods}</span>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

export default function OrderActivationPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OrderActivationInner />
    </Suspense>
  );
}
