'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Store, Package, HandCoins, ShoppingCart } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { triggerHaptic } from '@/lib/telegram';
import { cartCount, onCartChange } from '@/lib/cart';

export default function BottomNav() {
  const t = useT();
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(cartCount());
    return onCartChange(() => setCount(cartCount()));
  }, []);

  const items = [
    { href: '/', label: t.home, icon: Store, match: (p: string) => p === '/' },
    { href: '/orders', label: t.orders, icon: Package, match: (p: string) => p.startsWith('/orders') || p.startsWith('/order/') },
    { href: '/affiliate', label: t.affiliate, icon: HandCoins, match: (p: string) => p.startsWith('/affiliate') },
    { href: '/cart', label: t.cart, icon: ShoppingCart, match: (p: string) => p.startsWith('/cart') },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="mx-3 mb-3 rounded-2xl border border-apptext/10 bg-appsurface/90 backdrop-blur-2xl shadow-2xl shadow-black/50">
        <div className="grid grid-cols-4 h-16">
          {items.map((item) => {
            const active = item.match(pathname || '/');
            const Icon = item.icon;
            const isCart = item.href === '/cart';
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => triggerHaptic('light')}
                className="flex flex-col items-center justify-center gap-1 relative"
              >
                {active && (
                  <span className="absolute top-0 w-8 h-0.5 rounded-full bg-gradient-to-r from-brand-300 to-brand-600" />
                )}
                <span className="relative">
                  <Icon className={`w-5 h-5 ${active ? 'text-brand-400' : 'text-apptext-3'}`} />
                  {isCart && count > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-brand-400 text-slate-950 text-[9px] font-black flex items-center justify-center">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] font-bold ${active ? 'text-brand-300' : 'text-apptext-3'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
