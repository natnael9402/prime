'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  FlaskConical, Smartphone, CreditCard, Landmark, ShieldCheck, X, RefreshCw, ChevronLeft,
} from 'lucide-react';
import { triggerHaptic, triggerNotificationHaptic } from '@/lib/telegram';
import { useT } from '@/lib/i18n';
import Loading from '@/app/loading';

export default function MockCheckoutPage() {
  const t = useT();
  const params = useParams();
  const router = useRouter();
  const orderId = params?.orderId as string;

  const [order, setOrder] = useState<any>(null);
  const [cartInfo, setCartInfo] = useState<{ count: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState('telebirr');
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [stage, setStage] = useState<'select' | 'processing'>('select');

  const METHODS = [
    { id: 'telebirr', label: t.telebirr, color: 'from-emerald-500 to-teal-600', icon: Smartphone },
    { id: 'cbe', label: t.cbe, color: 'from-violet-500 to-purple-600', icon: Landmark },
    { id: 'card', label: t.card, color: 'from-sky-500 to-blue-600', icon: CreditCard },
  ];

  useEffect(() => {
    if (!orderId) return;
    api
      .getOrder(orderId)
      .then(async (o) => {
        setOrder(o);
        if (o.status === 'PAID') {
          router.replace(`/order/${o.id}/activation?tx_ref=${o.cartRef || o.txRef}`);
          return;
        }
        if (o.cartRef) {
          try {
            const cartOrders = await api.getCartOrders(o.cartRef);
            const list = Array.isArray(cartOrders) ? cartOrders : cartOrders?.orders || [];
            if (list.length > 1) {
              setCartInfo({
                count: list.length,
                total: list.reduce((s: number, x: any) => s + (x.amount || 0), 0),
              });
            }
          } catch {}
        }
      })
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [orderId, router]);

  const handlePay = async () => {
    if (!order) return;
    triggerHaptic('heavy');
    setPaying(true);
    setStage('processing');
    try {
      // Simulate the bank/USSD confirmation delay
      await new Promise((r) => setTimeout(r, 1800));
      const updated = await api.mockConfirmOrder(order.id);
      triggerNotificationHaptic('success');
      const ref = order.cartRef || updated?.cartRef || updated?.txRef || order.txRef;
      router.replace(`/order/${order.id}/activation?tx_ref=${ref}`);
    } catch (err: any) {
      triggerNotificationHaptic('error');
      setStage('select');
      setPaying(false);
      alert(err.response?.data?.message || t.errorGeneric);
    }
  };

  if (loading) {
    return <Loading />;
  }

  if (!order) {
    return (
      <div className="app-shell flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-apptext font-bold">{t.errorGeneric}</p>
        <button onClick={() => router.push('/')} className="btn-primary px-5 py-2 rounded-xl text-xs font-black">
          {t.back}
        </button>
      </div>
    );
  }

  const product = order.product;
  const activeMethod = METHODS.find((m) => m.id === method)!;
  const displayAmount = cartInfo ? cartInfo.total : order.amount;
  const closeRef = order.cartRef || order.txRef;

  return (
    <div className="app-shell flex flex-col">
      <main className="app-scroll w-full flex flex-col items-center px-3 py-6">
      <div className="w-full max-w-md space-y-4">
        {/* Test mode banner */}
        <div className="fade-up flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[11px] font-black uppercase tracking-wide">
          <FlaskConical className="w-4 h-4" />
          <span>{t.mockCheckout}</span>
        </div>

        {/* Chapa-style card */}
        <div className="fade-up glass rounded-3xl overflow-hidden" style={{ animationDelay: '60ms' }}>
          <div className="bg-gradient-to-r from-[#12271C] to-appbg px-5 py-4 flex items-center justify-between border-b border-apptext/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-400/20 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-emerald-300" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-black text-apptext">chapa<span className="text-emerald-400">.co</span></div>
                <div className="text-[9px] text-apptext-2 font-semibold">{t.mockHint}</div>
              </div>
            </div>
            <button
              onClick={() => router.push(`/order/${order.id}/activation?tx_ref=${closeRef}`)}
              className="p-1.5 rounded-lg bg-apptext/5 text-apptext-2 hover:text-apptext transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Order summary */}
            <div className="flex items-center gap-3 pb-4 border-b border-apptext/5">
              {product?.bannerUrl && (
                <img src={product.bannerUrl} alt={product.name} className="w-12 h-12 rounded-xl object-cover border border-apptext/10" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-apptext truncate">
                  {cartInfo ? `${cartInfo.count} ${t.items}` : product?.name}
                </div>
                <div className="text-[10px] text-apptext-3 font-mono">{closeRef}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-gradient">{displayAmount.toLocaleString()}</div>
                <div className="text-[9px] font-bold text-apptext-3">{order.currency}</div>
              </div>
            </div>

            {stage === 'select' ? (
              <>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-apptext-2">{t.selectMethod}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {METHODS.map((m) => {
                      const Icon = m.icon;
                      const active = method === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            setMethod(m.id);
                            triggerHaptic('light');
                          }}
                          className={`rounded-2xl p-3 flex flex-col items-center gap-1.5 border transition-all ${
                            active
                              ? 'border-brand-400/60 bg-brand-400/10'
                              : 'border-apptext/10 bg-apptext/[0.04] hover:border-apptext/20'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center shadow-lg`}>
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                          <span className={`text-[10px] font-black ${active ? 'text-brand-300' : 'text-apptext-2'}`}>
                            {m.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-apptext-2">{t.phone}</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0911 000 000"
                    className="w-full input-dark rounded-xl px-4 py-3 text-sm text-apptext placeholder-apptext-3 font-mono tracking-wide"
                  />
                </div>

                <button
                  onClick={handlePay}
                  disabled={paying}
                  className="btn-primary w-full py-3.5 rounded-2xl font-black text-sm"
                >
                  {t.paySuccess} • {displayAmount.toLocaleString()} {order.currency}
                </button>

                <button
                  onClick={() => router.back()}
                  className="btn-ghost w-full py-2.5 rounded-2xl text-[11px] font-bold text-apptext-2 flex items-center justify-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  {t.cancelPayment}
                </button>
              </>
            ) : (
              <div className="py-8 flex flex-col items-center gap-4 text-center">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${activeMethod.color} flex items-center justify-center animate-pulse shadow-2xl`}>
                  <activeMethod.icon className="w-7 h-7 text-white" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-black text-apptext">{activeMethod.label}</p>
                  <p className="text-[11px] text-apptext-2">{t.verifying}</p>
                </div>
                <RefreshCw className="w-5 h-5 animate-spin text-brand-400" />
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-apptext-3 font-semibold px-6">
          {t.testMode} — {t.mockHint}. {t.liveHint}
        </p>
      </div>
      </main>
    </div>
  );
}
