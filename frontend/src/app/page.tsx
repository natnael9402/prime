'use client';

import React, { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import ProductCard from '@/components/ProductCard';
import { api } from '@/lib/api';
import { ShieldCheck, Zap, RefreshCw, Sparkles, HandCoins, Package } from 'lucide-react';
import { expandTelegramApp, storeRefCode, triggerHaptic } from '@/lib/telegram';
import { useT } from '@/lib/i18n';
import Link from 'next/link';
import Loading from '@/app/loading';

/** Admin-driven hero/promo cards (backend /home-cards). */
function HomeCardsSection({ cards }: { cards: any[] }) {
  const t = useT();
  const heroes = cards.filter((c) => c.kind !== 'promo');
  const promos = cards.filter((c) => c.kind === 'promo');
  const n = heroes.length;
  // True infinite loop: clone of the last card up front, clone of the first at the back.
  const slides = n > 1 ? [heroes[n - 1], ...heroes, heroes[0]] : heroes;
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const pauseUntil = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didInit = useRef(false);

  /** Width of one slide + the track gap = scroll distance per card. */
  const stepOf = (el: HTMLDivElement) => {
    const first = el.children[0] as HTMLElement | undefined;
    const g = parseFloat(getComputedStyle(el).columnGap);
    return (first?.offsetWidth || el.clientWidth) + (isNaN(g) ? 0 : g);
  };

  // Mount: jump straight onto the first REAL card (slide 1) before paint.
  const setTrackRef = (el: HTMLDivElement | null) => {
    trackRef.current = el;
    if (el && n > 1 && !didInit.current) {
      didInit.current = true;
      el.scrollLeft = stepOf(el);
    }
  };

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: (i + 1) * stepOf(el), behavior: 'smooth' });
  };

  // Infinite auto-advance — slides forward forever (clones hide the wrap),
  // pausing briefly after the user swipes manually.
  useEffect(() => {
    if (n < 2) return;
    const id = setInterval(() => {
      if (Date.now() < pauseUntil.current) return;
      const el = trackRef.current;
      if (!el) return;
      const step = stepOf(el);
      const idx = Math.round(el.scrollLeft / step);
      const next = Math.min(idx + 1, n + 1);
      el.scrollTo({ left: next * step, behavior: 'smooth' });
      if (next === n + 1) {
        // Landed on the clone of the first card — snap to the real one
        // once the forward motion ends. Timer-driven so it works even
        // when scroll events are throttled.
        setTimeout(() => {
          const e = trackRef.current;
          if (e) e.scrollTo({ left: stepOf(e), behavior: 'auto' });
        }, 700);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [n]);

  const handleTrackScroll = () => {
    pauseUntil.current = Date.now() + 9000;
    const el = trackRef.current;
    if (!el || n < 2) return;
    const step = stepOf(el);
    const idx = Math.round(el.scrollLeft / step);
    setActive((((idx - 1) % n) + n) % n);
    // Once scrolling settles on a clone, teleport to its real twin — instant and invisible.
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const e2 = trackRef.current;
      if (!e2) return;
      const s2 = stepOf(e2);
      const i2 = Math.round(e2.scrollLeft / s2);
      if (i2 === 0) e2.scrollTo({ left: n * s2, behavior: 'auto' });
      else if (i2 === n + 1) e2.scrollTo({ left: s2, behavior: 'auto' });
    }, 220);
  };

  const iconFor = (name?: string | null) => {
    switch ((name || '').toLowerCase()) {
      case 'handcoins': return HandCoins;
      case 'zap': return Zap;
      case 'shield': return ShieldCheck;
      case 'package': return Package;
      default: return Sparkles;
    }
  };

  const linkFor = (card: any): string | null => {
    if (card.linkType === 'product' && card.productId) return `/product/${card.productId}`;
    if (card.linkType === 'url' && card.linkUrl) return card.linkUrl;
    return null;
  };

  const Wrapper = ({ card, className, children }: { card: any; className: string; children: React.ReactNode }) => {
    const href = linkFor(card);
    const borderCls = card.animatedBorder
      ? card.borderStyle === 'blue'
        ? 'border-circulate-blue'
        : 'border-circulate'
      : '';
    const cls = `${className} ${borderCls} ${href ? 'cursor-pointer' : ''}`;
    if (!href) return <div className={cls}>{children}</div>;
    if (href.startsWith('http')) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className={cls} onClick={() => triggerHaptic('light')}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={cls} onClick={() => triggerHaptic('light')}>
        {children}
      </Link>
    );
  };

  return (
    <>
      {heroes.length > 0 && (
        <section className="fade-up">
          <div
            ref={setTrackRef}
            onScroll={handleTrackScroll}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none rounded-3xl"
          >
            {slides.map((card, si) => {
              const Icon = iconFor(card.icon);
              const gemini = !!card.animatedBorder;
              return (
                <div key={si === 0 || si === slides.length - 1 ? `${card.id}-clone-${si}` : card.id} className="min-w-full snap-center">
                  <Wrapper card={card} className={`relative block h-full rounded-3xl overflow-hidden ${gemini ? 'gemini-card' : 'glass'}`}>
                    {gemini ? (
                      /* ── Gemini card: full-bleed artwork from R2 CDN
                            (falls back to the bundled generated art).
                            Animated border (border-circulate) stays on the Wrapper. ── */
                      <div className="relative min-h-[240px] sm:min-h-[300px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={card.imageUrl || '/gemini-card.jpg'}
                          alt={card.title || 'Featured'}
                          className={`absolute inset-0 w-full h-full object-cover ${card.imageUrl ? '' : 'scale-[1.04]'}`}
                        />
                      </div>
                    ) : (
                      /* ── Standard hero card (unchanged look) ── */
                      <>
                        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
                        <div className="relative p-5 sm:p-8 min-h-[240px] sm:min-h-[300px] flex flex-col justify-center space-y-3">
                          {card.badgeText && (
                            <div className="inline-flex w-fit items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-brand-400/10 border border-brand-400/25 text-brand-300">
                              <Icon className="w-3 h-3" />
                              {card.badgeText}
                            </div>
                          )}
                          <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
                            <span className="text-gradient">{card.title}</span>
                          </h1>
                          {card.subtitle && (
                            <div className="flex items-center gap-2 text-[11px] font-semibold text-apptext-2">
                              <Zap className="w-3.5 h-3.5 fill-current text-emerald-400" />
                              <span>{card.subtitle}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </Wrapper>
                </div>
              );
            })}
          </div>

          {heroes.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-3">
              {heroes.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { pauseUntil.current = Date.now() + 9000; goTo(i); }}
                  aria-label={`Card ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    active === i ? 'w-4 bg-brand-400' : 'w-1.5 bg-apptext/20'
                  }`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {promos.length > 0 && (
        <section className={`fade-up grid gap-3 ${promos.length > 1 ? 'sm:grid-cols-2' : ''}`} style={{ animationDelay: `${heroes.length * 60}ms` }}>
          {promos.map((card) => {
            const Icon = iconFor(card.icon);
            return (
              <Wrapper
                key={card.id}
                card={card}
                className="flex items-center gap-3 rounded-2xl p-5 min-h-[88px] bg-gradient-to-br from-emerald-500/15 to-teal-500/5 border border-emerald-500/25 hover:border-emerald-400/50 transition-colors group"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6 text-emerald-300" />
                </div>
                <div className="leading-tight min-w-0">
                  <div className="text-[13px] font-black text-emerald-300 group-hover:text-emerald-200 truncate">
                    {card.title}
                  </div>
                  {card.subtitle && <div className="text-[10px] text-apptext-2 font-semibold truncate">{card.subtitle}</div>}
                </div>
              </Wrapper>
            );
          })}
        </section>
      )}
    </>
  );
}

function StoreHomeInner() {
  const t = useT();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<any[]>([]);
  const [homeCards, setHomeCards] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Capture ?ref= affiliate code once
  useEffect(() => {
    const ref = searchParams?.get('ref');
    if (ref) {
      storeRefCode(ref);
      api.trackAffiliateClick(ref).catch(() => {});
    }
  }, [searchParams]);

  useEffect(() => {
    expandTelegramApp();
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [prods, cards] = await Promise.all([
        api.getProducts(),
        api.getHomeCards().catch(() => []),
      ]);
      setProducts(prods);
      setHomeCards(Array.isArray(cards) ? cards : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell flex flex-col">
      <Navbar />

      <main className="app-scroll pb-app-nav max-w-6xl w-full mx-auto px-3 sm:px-6 pt-4 space-y-5">
        {/* HERO — admin-driven cards only; skeleton while loading; nothing when empty */}
        {loading && homeCards.length === 0 ? (
          <section className="fade-up">
            <div className="skeleton rounded-3xl min-h-[240px] sm:min-h-[300px] w-full" />
            <div className="flex items-center justify-center gap-1.5 pt-3">
              <div className="skeleton h-1.5 w-4 rounded-full" />
              <div className="skeleton h-1.5 w-1.5 rounded-full" />
              <div className="skeleton h-1.5 w-1.5 rounded-full" />
            </div>
          </section>
        ) : homeCards.length > 0 ? (
          <HomeCardsSection cards={homeCards} />
        ) : null}

        {/* PRODUCTS */}
        <section className="fade-up" style={{ animationDelay: '120ms' }}>
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden glass">
                  <div className="h-40 skeleton" />
                  <div className="p-3.5 space-y-2">
                    <div className="h-3 w-2/3 rounded skeleton" />
                    <div className="h-2.5 w-full rounded skeleton" />
                    <div className="h-8 w-full rounded-xl skeleton" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center glass rounded-3xl space-y-3">
              <Package className="w-10 h-10 text-apptext-3 mx-auto" />
              <p className="text-apptext-2 font-bold text-sm">{t.empty}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {products.map((prod, idx) => (
                <div key={prod.id} className="fade-up" style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}>
                  <ProductCard product={prod} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}

export default function StoreHome() {
  return (
    <Suspense fallback={<Loading />}>
      <StoreHomeInner />
    </Suspense>
  );
}
