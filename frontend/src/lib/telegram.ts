export interface TelegramUser {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface VerifiedTgUser {
  telegramId: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
}

export const getTelegramWebApp = () => {
  if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
    return (window as any).Telegram.WebApp;
  }
  return null;
};

export const getTelegramUser = (): TelegramUser | null => {
  const tg = getTelegramWebApp();
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    return tg.initDataUnsafe.user;
  }
  return null;
};

/** Raw signed initData string — send to backend for verification. */
export const getTelegramInitData = (): string | null => {
  const tg = getTelegramWebApp();
  return tg && tg.initData ? tg.initData : null;
};

// ---------- Verified session persistence ----------
const SESSION_KEY = 'kv_tg_session';
const TGUSER_KEY = 'kv_tg_user';

export const storeTgSession = (token: string) => {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
  } catch {}
};

export const getTgSession = (): string | null => {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};

export const storeTgUser = (user: VerifiedTgUser) => {
  try {
    if (user) localStorage.setItem(TGUSER_KEY, JSON.stringify(user));
  } catch {}
};

export const getStoredTgUser = (): VerifiedTgUser | null => {
  try {
    const raw = localStorage.getItem(TGUSER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const triggerHaptic = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
  const tg = getTelegramWebApp();
  if (tg && tg.HapticFeedback) {
    tg.HapticFeedback.impactOccurred(style);
  }
};

export const triggerNotificationHaptic = (type: 'error' | 'success' | 'warning' = 'success') => {
  const tg = getTelegramWebApp();
  if (tg && tg.HapticFeedback) {
    tg.HapticFeedback.notificationOccurred(type);
  }
};

export const expandTelegramApp = () => {
  const tg = getTelegramWebApp();
  if (tg) {
    tg.ready();
    tg.expand();
  }
};

export const openTelegramLink = (url: string) => {
  const tg = getTelegramWebApp();
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
};

export const shareToTelegram = (text: string, url?: string) => {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url || '')}&text=${encodeURIComponent(text)}`;
  openTelegramLink(shareUrl);
};

// ---------- Referral code persistence ----------
const REF_KEY = 'kv_ref_code';

export const storeRefCode = (code: string) => {
  try {
    if (code) localStorage.setItem(REF_KEY, code);
  } catch {}
};

export const getRefCode = (): string | null => {
  try {
    return localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
};

// ---------- Affiliate code persistence ----------
const AFF_KEY = 'kv_affiliate_code';

export const storeAffiliateCode = (code: string) => {
  try {
    if (code) localStorage.setItem(AFF_KEY, code);
  } catch {}
};

export const getAffiliateCode = (): string | null => {
  try {
    return localStorage.getItem(AFF_KEY);
  } catch {
    return null;
  }
};

// ---------- Buyer identity (for My Orders outside Telegram) ----------
const EMAIL_KEY = 'kv_buyer_email';

export const storeBuyerEmail = (email: string) => {
  try {
    if (email) localStorage.setItem(EMAIL_KEY, email);
  } catch {}
};

export const getBuyerEmail = (): string | null => {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
};

// ---------- Telegram theme sync (app follows the user's Telegram theme) ----------
const hexToTriplet = (hex?: string | null): string | null => {
  if (!hex) return null;
  let m = hex.replace('#', '');
  if (m.length === 3) m = m.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const n = parseInt(m, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

const mixTriplets = (a: string, b: string, ratio: number): string => {
  const pa = a.split(' ').map(Number);
  const pb = b.split(' ').map(Number);
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * ratio)).join(' ');
};

/** Apply Telegram WebApp.themeParams to the app's CSS theme variables. */
export const applyTelegramTheme = () => {
  if (typeof document === 'undefined') return;
  const tg = getTelegramWebApp();
  if (!tg || !tg.themeParams) return;
  const p = tg.themeParams;
  const root = document.documentElement;
  const set = (key: string, val: string | null) => {
    if (val) root.style.setProperty(key, val);
  };

  const bg = hexToTriplet(p.bg_color);
  const surface = hexToTriplet(p.secondary_bg_color || p.section_bg_color);
  const text = hexToTriplet(p.text_color);
  const hint = hexToTriplet(p.hint_color);
  const subtitle = hexToTriplet(p.subtitle_text_color);

  set('--bg-rgb', bg);
  set('--surface-rgb', surface);
  if (surface && text) set('--surface-2-rgb', mixTriplets(surface, text, 0.04));
  set('--text-1', text);
  set('--text-2', hint);
  set('--text-3', subtitle || hint);

  root.setAttribute('data-tg-scheme', tg.colorScheme || 'dark');

  try {
    if (p.bg_color && tg.setHeaderColor) tg.setHeaderColor(p.bg_color);
    if (p.bg_color && tg.setBackgroundColor) tg.setBackgroundColor(p.bg_color);
  } catch {}
};

/** Apply the Telegram theme now and keep it synced on themeChanged. */
export const initTelegramThemeSync = () => {
  applyTelegramTheme();
  const tg = getTelegramWebApp();
  if (tg && tg.onEvent) {
    try {
      tg.onEvent('themeChanged', applyTelegramTheme);
    } catch {}
  }
};
