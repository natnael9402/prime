'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import { api } from '@/lib/api';
import {
  Zap, ShieldCheck, CheckCircle2, ArrowRight, ArrowLeft, Cpu, Share2, RefreshCw, Package, HandCoins,
  Plus, Minus, ShoppingCart, Check, Bell, BellCheck,
} from 'lucide-react';
import {
  triggerHaptic, getTelegramUser, getRefCode, getAffiliateCode, shareToTelegram,
} from '@/lib/telegram';
import { addToCart } from '@/lib/cart';
import { useLang, useT } from '@/lib/i18n';
import { localizedProductContent } from '@/lib/productContent';
import PaymentLogos from '@/components/PaymentLogos';
import Loading from '@/app/loading';

export default function ProductClient() {
  const t = useT();
  const lang = useLang();
  const params = useParams();
  const router = useRouter();
  const productId = params?.id as string;

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState<string>('');
  const [purchasing, setPurchasing] = useState(false);
  const [payError, setPayError] = useState<string>('');
  const [refCode, setRefCode] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [notifyState, setNotifyState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [needsTelegram, setNeedsTelegram] = useState(false);
  const content = product ? localizedProductContent(product, lang) : null;

  useEffect(() => {
    if (productId) loadProduct();
    setRefCode(getRefCode());
  }, [productId]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const data = await api.getProduct(productId);
      setProduct(data);
      if (data.bannerUrl) setActiveImage(data.bannerUrl);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    triggerHaptic('medium');
    const affCode = getAffiliateCode();
    // Affiliates share a Telegram bot deep link (t.me/<bot>?start=…), not a raw web URL
    let url = `${window.location.origin}/product/${productId}${affCode ? `?ref=${affCode}` : ''}`;
    if (affCode) {
      try {
        const res = await api.getAffiliateShareLink(affCode, productId);
        if (res?.link) url = res.link;
      } catch {}
    }
    shareToTelegram(`🔑 ${content?.name || product?.name} — ${product?.price} ${product?.currency} ${t.only}`, url);
  };

  const handleAddToCart = () => {
    if (!product || isOutOfStock) return;
    triggerHaptic('medium');
    addToCart(
      {
        id: product.id,
        name: content?.name || product.name,
        price: product.price,
        currency: product.currency,
        bannerUrl: product.bannerUrl,
        stock: product.stock,
      },
      quantity,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };


  const handleNotify = async () => {
    if (!product || !isOutOfStock) return;
    const tgUser = getTelegramUser();
    if (!tgUser?.id) {
      setNeedsTelegram(true);
      triggerHaptic('rigid');
      return;
    }
    triggerHaptic('heavy');
    setNotifyState('saving');
    setPayError('');
    try {
      await api.subscribeStockAlert({
        productId: product.id,
        telegramUserId: tgUser.id.toString(),
        username: tgUser.username,
        firstName: tgUser.first_name,
      });
      setNotifyState('done');
      triggerHaptic('medium');
    } catch (err: any) {
      setPayError(err.response?.data?.message || t.errorGeneric);
      setNotifyState('idle');
      triggerHaptic('rigid');
    }
  };

  const handleCheckout = async () => {
    if (!product || product.stock <= 0) return;

    triggerHaptic('heavy');
    setPurchasing(true);
    setPayError('');

    try {
      const tgUser = getTelegramUser();
      const res = await api.initializePayment({
        productId: product.id,
        quantity,
        customerName: tgUser ? `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() : undefined,
        telegramUserId: tgUser?.id?.toString(),
        telegramUsername: tgUser?.username,
        refCode: getRefCode() || undefined,
      });

      if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
      } else {
        router.push(`/order/${res.orderId}/activation?tx_ref=${res.txRef}`);
      }
    } catch (err: any) {
      setPayError(err.response?.data?.message || t.errorGeneric);
      triggerHaptic('rigid');
      setPurchasing(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  if (!product) {
    return (
      <div className="app-shell flex flex-col">
        <Navbar showBack />
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center gap-4">
          <Package className="w-12 h-12 text-apptext-3" />
          <p className="text-base font-bold text-apptext">{t.empty}</p>
          <button onClick={() => router.push('/')} className="btn-primary px-5 py-2 rounded-xl text-xs font-black">
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  const isOutOfStock = product.stock <= 0;
  const gallery: string[] = product.gallery?.length ? product.gallery : [product.bannerUrl];
  const discountPct =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round((1 - product.price / product.originalPrice) * 100)
      : 0;

  return (
    <div className="app-shell flex flex-col">
      <Navbar showBack />

      <main className="app-scroll pb-app-nav max-lg:pb-[11rem] max-w-6xl w-full mx-auto px-3 sm:px-6 py-0 lg:py-4 space-y-5">
        {/* Desktop-only back/share row (mobile back lives in the navbar) */}
        <div className="hidden lg:flex items-center justify-between pt-4">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-apptext-2 hover:text-brand-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t.back}</span>
          </button>
          <button
            onClick={handleShare}
            className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-apptext"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{t.share}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT: media + details */}
          <div className="lg:col-span-7 space-y-4">
            {/* Gallery — full-bleed on mobile, floating controls */}
            <div className="relative overflow-hidden glass h-80 sm:h-96 fade-up -mx-3 sm:-mx-6 lg:mx-0 rounded-none lg:rounded-3xl border-0 lg:border">
              <img src={activeImage || product.bannerUrl} alt={content?.name || product.name} className="w-full h-full object-cover" />

              {/* Floating share (mobile) — back now lives in the navbar */}
              <button
                onClick={handleShare}
                aria-label={t.share}
                className="lg:hidden absolute top-3 right-3 w-9 h-9 rounded-full bg-black/45 backdrop-blur-md text-white flex items-center justify-center active:scale-90 transition-transform"
              >
                <Share2 className="w-4 h-4" />
              </button>

              {/* Badges — overlay on desktop only (mobile shows them under the image) */}
              <div className="hidden lg:flex absolute top-3 left-3 flex-wrap gap-1.5">
                {product.badge && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-brand-400 text-slate-950 shadow-lg">
                    {product.badge}
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-current" />
                  {t.instant}
                </span>
              </div>

              {/* Gallery dots (mobile) */}
              {gallery.length > 1 && (
                <div className="lg:hidden absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/40 backdrop-blur-md">
                  {gallery.map((imgUrl: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImage(imgUrl)}
                      aria-label={`Image ${idx + 1}`}
                      className={`h-1.5 rounded-full transition-all ${
                        activeImage === imgUrl ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* MOBILE: Etsy-style price / title / meta block */}
            <div className="lg:hidden space-y-3 fade-up">
              <div className="flex flex-wrap items-center gap-1.5">
                {product.badge && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-brand-400 text-slate-950">
                    {product.badge}
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-current" />
                  {t.instant}
                </span>
              </div>

              <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                <span className="text-[26px] leading-none font-black text-apptext">
                  {(product.price * quantity).toLocaleString()}
                  <span className="text-sm font-bold text-apptext-2 ml-1">{product.currency}</span>
                </span>
                {discountPct > 0 && (
                  <>
                    <span className="text-[13px] text-apptext-3 line-through">
                      {(product.originalPrice * quantity).toLocaleString()}
                    </span>
                    <span className="text-[11px] font-black text-emerald-400">({discountPct}% off)</span>
                  </>
                )}
              </div>

              <h1 className="text-[15px] font-bold text-apptext leading-snug">{content?.name || product.name}</h1>

              {/* Meta row: quantity / stock / format */}
              <div className="grid grid-cols-3 rounded-2xl border border-apptext/10 bg-apptext/[0.03] divide-x divide-apptext/10">
                <div className="py-2.5 px-2 flex flex-col items-center gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-apptext-3">{t.quantity}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { triggerHaptic('light'); setQuantity((q) => Math.max(1, q - 1)); }}
                      className="w-6 h-6 rounded-lg bg-apptext/5 border border-apptext/10 flex items-center justify-center text-apptext active:scale-90 transition-all"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="min-w-[16px] text-center text-[13px] font-black text-apptext">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => { triggerHaptic('light'); setQuantity((q) => Math.min(product.stock > 0 ? Math.min(product.stock, 50) : 50, q + 1)); }}
                      className="w-6 h-6 rounded-lg bg-apptext/5 border border-apptext/10 flex items-center justify-center text-apptext active:scale-90 transition-all"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="py-2.5 px-2 flex flex-col items-center justify-center gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-apptext-3">{t.inStock}</span>
                  <span className={`text-[12px] font-black ${isOutOfStock ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {isOutOfStock ? t.soldOut : product.stock}
                  </span>
                </div>
                <div className="py-2.5 px-2 flex flex-col items-center justify-center gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-apptext-3">{t.instant}</span>
                  <span className="text-[12px] font-black text-brand-300 flex items-center gap-1">
                    <Zap className="w-3 h-3 fill-current" />
                    {product.category?.name || 'Digital'}
                  </span>
                </div>
              </div>

              {refCode && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-300">
                  <HandCoins className="w-3.5 h-3.5" />
                  <span>{t.refApplied} ({refCode})</span>
                </div>
              )}

              <PaymentLogos />

              {payError && (
                <div className="px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] font-semibold leading-snug">
                  {payError}
                </div>
              )}
            </div>

            {gallery.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {gallery.map((imgUrl: string, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(imgUrl)}
                    className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                      activeImage === imgUrl ? 'border-brand-400' : 'border-apptext/10 opacity-60'
                    }`}
                  >
                    <img src={imgUrl} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {content?.description && (
              <div className="glass rounded-2xl p-4 sm:p-5 fade-up">
                <p className="text-[13px] text-apptext leading-relaxed">{content.description}</p>
              </div>
            )}

            <div className="glass rounded-2xl p-4 sm:p-5 space-y-3 fade-up">
              <h2 className="text-[13px] font-black text-apptext flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-brand-400" />
                <span>{t.features}</span>
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {content?.features?.map((feat: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 bg-apptext/[0.04] p-2.5 rounded-xl border border-apptext/5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] text-apptext leading-snug">{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {content?.requirements?.length > 0 && (
              <div className="glass rounded-2xl p-4 sm:p-5 space-y-2.5 fade-up">
                <h3 className="text-[13px] font-black text-apptext flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-brand-400" />
                  <span>{t.requirements}</span>
                </h3>
                <ul className="space-y-1.5">
                  {content.requirements.map((req: string, idx: number) => (
                    <li key={idx} className="flex items-center gap-2 text-[11px] text-apptext-2">
                      <span className="w-1 h-1 rounded-full bg-brand-400 shrink-0" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* RIGHT: buy box — desktop only (mobile uses the fixed buy bar) */}
          <div className="hidden lg:block lg:col-span-5 lg:sticky lg:top-20">
            <div className="glass rounded-3xl p-5 space-y-4 fade-up" style={{ animationDelay: '80ms' }}>
              <div className="space-y-1.5">
                {product.category && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400/80">
                    {product.category.name}
                  </span>
                )}
                <h1 className="text-lg sm:text-xl font-black text-apptext leading-snug">{content?.name || product.name}</h1>
              </div>

              <div className="rounded-2xl bg-appbg/70 border border-apptext/5 p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-apptext-3 font-bold block">{t.total}</span>
                  <div className="flex items-baseline gap-1.5">
                    {product.originalPrice && (
                      <span className="text-[11px] text-apptext-3 line-through">
                        {(product.originalPrice * quantity).toLocaleString()}
                      </span>
                    )}
                    <span className="text-2xl font-black text-gradient">{(product.price * quantity).toLocaleString()}</span>
                    <span className="text-[11px] font-bold text-apptext-2">{product.currency}</span>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                    isOutOfStock
                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                      : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                  }`}
                >
                  {isOutOfStock ? t.soldOut : `${t.inStock} • ${product.stock}`}
                </span>
              </div>

              {!isOutOfStock && (
                <div className="flex items-center justify-between rounded-2xl border border-apptext/5 bg-appbg/70 px-4 py-3">
                  <span className="text-[11px] font-bold text-apptext-2">{t.quantity}</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => { triggerHaptic('light'); setQuantity((q) => Math.max(1, q - 1)); }}
                      className="w-8 h-8 rounded-xl bg-apptext/5 border border-apptext/10 flex items-center justify-center text-apptext hover:border-brand-400/40 active:scale-90 transition-all"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-black text-apptext">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => { triggerHaptic('light'); setQuantity((q) => Math.min(product.stock > 0 ? Math.min(product.stock, 50) : 50, q + 1)); }}
                      className="w-8 h-8 rounded-xl bg-apptext/5 border border-apptext/10 flex items-center justify-center text-apptext hover:border-brand-400/40 active:scale-90 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {refCode && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-300">
                  <HandCoins className="w-3.5 h-3.5" />
                  <span>{t.refApplied} ({refCode})</span>
                </div>
              )}

              <div className="space-y-3">
                {payError && (
                  <div className="px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] font-semibold leading-snug">
                    {payError}
                  </div>
                )}

                {isOutOfStock ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleNotify}
                      disabled={notifyState !== 'idle'}
                      className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                        notifyState === 'done'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'btn-primary'
                      }`}
                    >
                      {notifyState === 'saving' ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : notifyState === 'done' ? (
                        <>
                          <BellCheck className="w-4 h-4" />
                          <span>{t.notifyDone}</span>
                        </>
                      ) : (
                        <>
                          <Bell className="w-4 h-4" />
                          <span>{t.notifyMe}</span>
                        </>
                      )}
                    </button>
                    <p className="text-center text-[10px] font-semibold text-apptext-3">
                      {needsTelegram ? t.notifyNeedsTelegram : t.notifyHint}
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      className={`shrink-0 w-12 rounded-2xl border flex items-center justify-center transition-all active:scale-95 ${
                        added
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-apptext/5 border-apptext/10 text-apptext hover:border-brand-400/40'
                      }`}
                      aria-label={t.addToCart}
                      title={t.addToCart}
                    >
                      {added ? <Check className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleCheckout}
                      disabled={purchasing}
                      className="btn-primary flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2"
                    >
                      {purchasing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>{t.connecting}</span>
                        </>
                      ) : (
                        <>
                          <span>
                            {t.payNow} • {(product.price * quantity).toLocaleString()} {product.currency}
                          </span>
                          <ArrowRight className="w-4 h-4 stroke-[3]" />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-apptext/5 space-y-1.5 text-[10px] text-apptext-3 font-semibold">
                <PaymentLogos />
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                  <span>{t.instantKeyHint}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* FIXED BUY BAR — mobile: buy without scrolling */}
      <div
        className="lg:hidden fixed left-0 right-0 z-40 px-3"
        style={{ bottom: 'calc(5.4rem + env(safe-area-inset-bottom))' }}
      >
        <div className="glass rounded-2xl p-2 flex gap-2 items-stretch shadow-2xl shadow-black/50">
          {isOutOfStock ? (
            <button
              type="button"
              onClick={handleNotify}
              disabled={notifyState !== 'idle'}
              className={`flex-1 py-3 rounded-xl font-black text-[12px] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] ${
                notifyState === 'done'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'btn-primary'
              }`}
            >
              {notifyState === 'saving' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : notifyState === 'done' ? (
                <>
                  <BellCheck className="w-4 h-4" />
                  <span>{t.notifyDone}</span>
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4" />
                  <span>{needsTelegram ? t.notifyNeedsTelegram : t.notifyMe}</span>
                </>
              )}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleAddToCart}
                className={`flex-1 py-3 rounded-xl text-[12px] font-black flex items-center justify-center gap-1.5 border transition-all active:scale-[0.98] ${
                  added
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'btn-ghost'
                }`}
              >
                {added ? <Check className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                <span>{t.addToCart}</span>
              </button>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={purchasing}
                className="btn-primary flex-[1.35] py-3 rounded-xl font-black text-[12px] flex items-center justify-center gap-1.5"
              >
                {purchasing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t.connecting}</span>
                  </>
                ) : (
                  <>
                    <span>{t.payNow} • {(product.price * quantity).toLocaleString()} {product.currency}</span>
                    <ArrowRight className="w-4 h-4 stroke-[3]" />
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
