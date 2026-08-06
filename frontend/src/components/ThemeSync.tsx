'use client';

import { useEffect } from 'react';
import { initTelegramThemeSync } from '@/lib/telegram';

/**
 * Keeps the app's surfaces/text in sync with the user's Telegram theme.
 * Initial colors are applied pre-paint by the inline script in layout.tsx;
 * this component applies them again on mount and listens for themeChanged.
 */
export default function ThemeSync() {
  useEffect(() => {
    initTelegramThemeSync();
  }, []);
  return null;
}
