'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Package, ShoppingBag, KeyRound, HandCoins, Layers, LayoutGrid, LogOut } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { setAdminToken } from '@/lib/api';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/products', label: 'Products & Keys', icon: Package },
  { href: '/supplier', label: 'Supplier', icon: Layers },
  { href: '/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/affiliates', label: 'Affiliates', icon: HandCoins },
  { href: '/hero', label: 'Home Cards', icon: LayoutGrid },
];

export default function AdminNavbar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    setAdminToken(null);
    router.replace('/login');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#070b14]/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/25">
              <KeyRound className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-black text-sm tracking-tight text-white">
                KEY<span className="text-amber-400">VAULT</span>
                <span className="ml-1.5 text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold border border-amber-500/25">
                  ADMIN
                </span>
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1 text-[11px] font-bold overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-amber-400/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              title="Sign out"
              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
