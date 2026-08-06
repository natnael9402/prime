'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FlaskConical, ShoppingCart } from 'lucide-react';
import {
  getTelegramUser, getTelegramInitData, getStoredTgUser, storeTgSession, storeTgUser,
} from '@/lib/telegram';
import { api } from '@/lib/api';
import { cartCount, onCartChange } from '@/lib/cart';
import { useT } from '@/lib/i18n';
import LanguagePicker from '@/components/LanguagePicker';

export default function Navbar({ showBack = false }: { showBack?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [testMode, setTestMode] = useState(false);
  const [count, setCount] = useState(0);
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    // Seamless Telegram sign-in: verify initData with the backend, which
    // auto-creates the account on first open. Falls back to local data.
    const local = getTelegramUser();
    const initData = getTelegramInitData();
    if (initData) {
      api
        .telegramAuth(initData)
        .then((res) => {
          if (res?.verified && res.user) {
            storeTgSession(res.token);
            storeTgUser(res.user);
            setUser(res.user);
          } else {
            setUser(local || getStoredTgUser());
          }
        })
        .catch(() => setUser(local || getStoredTgUser()));
    } else {
      setUser(local || getStoredTgUser());
    }

    setCount(cartCount());
    const off = onCartChange(() => setCount(cartCount()));
    api
      .getPaymentMode()
      .then((m) => setTestMode(!!m.testMode))
      .catch(() => {});
    return off;
  }, []);

  const displayName =
    (user?.firstName || user?.first_name || user?.username || '').toString();
  const photoUrl = user?.photoUrl || user?.photo_url;
  const initial = (displayName.trim().charAt(0) || 'U').toUpperCase();

  return (
    <header className="sticky top-0 z-50 bg-appbg/85 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-3 sm:px-6">
        <div className="flex items-center gap-2.5 h-14">
          {showBack && (
            <button
              onClick={() => router.back()}
              aria-label={t.back}
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full bg-apptext/5 border border-apptext/10 text-apptext hover:border-brand-400/40 hover:text-brand-300 transition-colors active:scale-90 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {testMode && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/25 text-[9px] font-bold uppercase tracking-wide">
                <FlaskConical className="w-3 h-3" />
                <span className="hidden sm:inline">{t.testMode}</span>
              </span>
            )}
            <LanguagePicker />
            <Link
              href="/cart"
              className="relative w-9 h-9 flex items-center justify-center rounded-full bg-apptext/5 border border-apptext/10 text-apptext hover:border-brand-400/40 hover:text-brand-300 transition-colors"
              aria-label={t.cart}
            >
              <ShoppingCart className="w-4 h-4" />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-brand-400 text-slate-950 text-[9px] font-black flex items-center justify-center">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
            {user && (
              <Link
                href="/orders"
                className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-apptext/5 border border-apptext/10 hover:border-brand-400/40 transition-colors"
              >
                {photoUrl && !imgBroken ? (
                  <img
                    src={photoUrl}
                    alt={displayName}
                    onError={() => setImgBroken(true)}
                    className="w-7 h-7 rounded-full object-cover ring-2 ring-brand-400/40"
                  />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-300 to-brand-600 text-slate-950 text-[11px] font-black flex items-center justify-center ring-2 ring-brand-400/40">
                    {initial}
                  </span>
                )}
                <span className="hidden sm:inline font-semibold text-[11px] text-apptext truncate max-w-[90px]">
                  {displayName}
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
