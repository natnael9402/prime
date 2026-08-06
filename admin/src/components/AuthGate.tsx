'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getAdminToken } from '@/lib/api';
import { KeyRound } from 'lucide-react';

/**
 * Client-side gate: every page except /login requires an admin token.
 * The backend independently enforces the same check on every admin API route.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname?.startsWith('/login');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    if (!getAdminToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [isLogin, pathname, router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <KeyRound className="w-6 h-6 text-amber-400 animate-pulse" />
      </div>
    );
  }

  return <>{children}</>;
}
