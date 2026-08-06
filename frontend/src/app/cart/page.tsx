'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import { api } from '@/lib/api';
import {
  getCart, setCartQuantity, removeFromCart, clearCart, onCartChange, type CartItem,
} from '@/lib/cart';
import { getTelegramUser, getRefCode, triggerHaptic } from '@/lib/telegram';
import { useT } from '@/lib/i18n';
import {
  ArrowLeft, ArrowRight, Minus, Plus, RefreshCw, ShieldCheck, ShoppingCart, Trash2, Zap,
} from 'lucide-react';

export default function CartPage() {
  const t = useT();
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [payError, setPayError] = useState('');

  useEffect(() => {
    setItems(getCart());
    const off = onCartChange(() => setItems(getCart()));
    return off;
  }, []);

  const currency = items[0]?.currency || 'ETB';
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  const updateQty = (productId: string, qty: number) => {
    triggerHaptic('light');
    setItems(setCartQuantity(productId, qty));
  };

  const removeItem = (productId: string) => {
    triggerHaptic('medium');
    setItems(removeFromCart(productId));
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;

    triggerHaptic('heavy');
    setCheckingOut(true);
    setPayError('');

    try {
      const tgUser = getTelegramUser();
      const res = await api.initializeCart({
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        customerName: tgUser ? `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() : undefined,
        telegramUserId: tgUser?.id?.toString(),
        telegramUsername: tgUser?.username,
        refCode: getRefCode() || undefined,
      });

      clearCart();
      if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
      } else {
        router.push(`/order/${res.orderId}/activation?tx_ref=${res.txRef}`);
      }
    } catch (err: any) {
      setPayError(err.response?.data?.message || t.errorGeneric);
      triggerHaptic('rigid');
      setCheckingOut(false);
    }
  };

  return (
    <div className="app-shell flex flex-col">
      <Navbar />

      <main className="app-scroll pb-app-nav max-w-6xl w-full mx-auto px-3 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-apptext-2 hover:text-brand-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t.back}</span>
          </button>
          <h1 className="text-base font-black text-apptext flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-brand-400" />
            {t.cart}
            {totalQty > 0 && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-brand-400/15 text-brand-300 border border-brand-400/25">
                {totalQty} {t.items}
              </span>
            )}
          </h1>
        </div>

        {items.length === 0 ? (
          <div className="glass rounded-3xl p-10 flex flex-col items-center text-center gap-4 fade-up">
            <div className="w-16 h-16 rounded-2xl bg-apptext/5 border border-apptext/10 flex items-center justify-center">
              <ShoppingCart className="w-7 h-7 text-apptext-3" />
            </div>
            <p className="text-sm font-bold text-apptext">{t.cartEmpty}</p>
            <Link href="/" className="btn-primary px-6 py-2.5 rounded-xl text-xs font-black">
              {t.goShopping}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Items */}
            <div className="lg:col-span-7 space-y-3">
              {items.map((item) => (
                <div key={item.productId} className="glass rounded-2xl p-3 flex gap-3 fade-up">
                  <Link href={`/product/${item.productId}`} className="shrink-0">
                    <img
                      src={item.bannerUrl}
                      alt={item.name}
                      className="w-20 h-20 rounded-xl object-cover border border-apptext/10"
                    />
                  </Link>
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/product/${item.productId}`}
                        className="text-[12px] font-black text-apptext leading-snug line-clamp-2 hover:text-brand-300 transition-colors"
                      >
                        {item.name}
                      </Link>
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="shrink-0 w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center hover:bg-rose-500/20 active:scale-90 transition-all"
                        aria-label={t.remove}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(item.productId, item.quantity - 1)}
                          className="w-7 h-7 rounded-lg bg-apptext/5 border border-apptext/10 flex items-center justify-center text-apptext active:scale-90 transition-all"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-black text-apptext">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.productId, item.quantity + 1)}
                          className="w-7 h-7 rounded-lg bg-apptext/5 border border-apptext/10 flex items-center justify-center text-apptext active:scale-90 transition-all"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-gradient">
                          {(item.price * item.quantity).toLocaleString()}
                        </span>
                        <span className="text-[10px] font-bold text-apptext-3 ml-1">{item.currency}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <Link
                href="/"
                className="btn-ghost inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-apptext"
              >
                <Plus className="w-3.5 h-3.5" />
                {t.continueShopping}
              </Link>
            </div>

            {/* Checkout */}
            <div className="lg:col-span-5 lg:sticky lg:top-20">
              <div className="glass rounded-3xl p-5 space-y-3 fade-up" style={{ animationDelay: '80ms' }}>
                <div className="rounded-2xl bg-appbg/70 border border-apptext/5 p-4 flex items-center justify-between">
                  <span className="text-[11px] text-apptext-3 font-bold">{t.subtotal}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-gradient">{subtotal.toLocaleString()}</span>
                    <span className="text-[11px] font-bold text-apptext-2">{currency}</span>
                  </div>
                </div>

                {payError && (
                  <div className="px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] font-semibold leading-snug">
                    {payError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className="btn-primary w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2"
                >
                  {checkingOut ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{t.connecting}</span>
                    </>
                  ) : (
                    <>
                      <span>{t.checkout} • {subtotal.toLocaleString()} {currency}</span>
                      <ArrowRight className="w-4 h-4 stroke-[3]" />
                    </>
                  )}
                </button>

                <div className="pt-2 border-t border-apptext/5 space-y-1.5 text-[10px] text-apptext-3 font-semibold">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{t.paymentMethods}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                    <span>{t.instantKeyHint}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
