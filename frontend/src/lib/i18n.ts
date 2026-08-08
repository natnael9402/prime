/**
 * Central UI strings — English & Amharic.
 * Keep every label short (≤ 2–3 words): long text breaks mobile layouts.
 * Language persists in localStorage; components read via useT().
 */
import { useEffect, useState } from 'react';

export type Lang = 'en' | 'am';

export const LANGUAGES: { code: Lang; native: string; english: string; greeting: string }[] = [
  { code: 'am', native: 'አማርኛ', english: 'Amharic', greeting: 'ሰላም' },
  { code: 'en', native: 'English', english: 'English', greeting: 'Hello' },
];

const en = {
  storeName: 'KeyVault',
  storeSub: 'Instant digital keys',

  // Nav
  home: 'Home',
  orders: 'Orders',
  affiliate: 'Affiliate',
  support: 'Support',

  // Home
  heroTitle: 'Premium Digital Keys',
  heroSub: 'Pay with Chapa · Get it instantly',
  searchPlaceholder: 'Search…',
  all: 'All',
  instant: 'Instant',
  secure: 'Secure',
  original: 'Original',
  empty: 'No products found',
  loading: 'Loading…',

  // Product
  buy: 'Buy',
  soldOut: 'Sold out',
  inStock: 'In stock',
  keys: 'Keys',
  left: 'left',
  only: 'only!',
  refApplied: 'Referral applied',
  paymentMethods: 'Chapa — Telebirr • CBE Birr • Card',
  instantKeyHint: 'Your key arrives instantly after payment',
  shareMsg: '🔑 Premium digital keys at fair prices — buy here!',
  shareOnTelegram: 'Share on Telegram',
  noSalesYet: 'No sales yet — share your link!',
  namePlaceholder: 'Abebe Bekele',
  liveHint: 'For live payments you need PAYMENT_MODE=live and a Chapa key.',
  oneTapHint: 'No name, no phone — your Telegram account is all you need',
  joinViaTelegram: 'Open Prime Store in Telegram to join instantly',
  features: 'Features',
  requirements: 'Requirements',
  fullName: 'Name',
  email: 'Email',
  phone: 'Phone',
  payNow: 'Pay now',
  connecting: 'Connecting…',
  back: 'Back',
  next: 'Next',
  share: 'Share',
  total: 'Total',

  // Activation
  paidSuccess: 'Purchase complete!',
  verifying: 'Verifying payment…',
  orderNo: 'Order',
  yourKey: 'Your key',
  copy: 'Copy',
  copied: 'Copied!',
  activation: 'Activation',
  download: 'Download',
  note: 'Note',
  checkStatus: 'Refresh status',
  payNowShort: 'Pay',
  pendingHint: 'After paying, tap "Refresh status".',

  // Delivery guide (account-delivery products)
  loginTo: 'Log in to',
  openInbox: 'Account email',
  inboxHint: 'Login codes arrive here',
  password: 'Password',
  emailPassword: 'Email password',
  open: 'Open',
  account: 'Account',
  yourAccounts: 'Your accounts',
  useOneBelow: 'Use one account below',
  vpnStep: 'Turn on a VPN first',
  vpnHint: 'Required in Ethiopia',

  // Orders page
  myOrders: 'My Orders',
  paid: 'Paid',
  pending: 'Pending',
  noOrders: 'No orders yet',
  emailHint: 'Search with your purchase email',
  findOrders: 'Search',
  viewKey: 'View key',

  // Affiliate
  becomeAffiliate: 'Become an Affiliate',
  affiliateHero: 'Share your link → earn commission',
  affiliateSub: 'Earn 10% on every sale',
  joinNow: 'Join now',
  payoutMethod: 'Payout method',
  telebirr: 'Telebirr',
  cbe: 'CBE Birr',
  yourLink: 'Your link',
  clicks: 'Clicks',
  sales: 'Sales',
  pendingEarnings: 'Pending',
  paidEarnings: 'Paid out',
  totalEarned: 'Total earned',
  howItWorks: 'How it works',
  step1: 'Join & get your link',
  step2: 'Share it on Telegram',
  step3: 'Earn on every sale',
  rate: 'Commission',
  recentSales: 'Recent sales',
  joining: 'Joining…',
  requestPayout: 'Request payout',
  choosePayoutMethod: 'How should we pay you?',
  telebirrPhone: 'Telebirr phone number',
  cbeAccount: 'CBE account number',
  submitRequest: 'Submit request',
  payoutSubmitted: 'Request received!',
  payoutSubmittedHint: "We'll send your payout shortly",
  continue: 'Continue',
  youllReceive: "You'll receive",

  // Test mode
  testMode: 'Test mode',
  mockCheckout: 'Chapa test payment',
  mockHint: 'No real money is charged',
  paySuccess: 'Pay (test)',
  cancelPayment: 'Cancel',
  selectMethod: 'Choose payment method',
  card: 'Card',

  // Cart
  cart: 'Cart',
  addToCart: 'Add to cart',
  addedToCart: 'Added!',
  cartEmpty: 'Your cart is empty',
  goShopping: 'Browse the store',
  checkout: 'Checkout',
  quantity: 'Quantity',
  remove: 'Remove',
  subtotal: 'Subtotal',
  items: 'items',
  continueShopping: 'Add more',

  // Language picker
  chooseLanguage: 'Choose your language',
  languageSub: 'You can change it anytime from the top bar',

  // Errors
  errorGeneric: 'Something went wrong',
  retry: 'Retry',
};

export type Dict = typeof en;

const am: Dict = {
  storeName: 'ቁልፍ ቫልት',
  storeSub: 'ፈጣን ዲጂታል ቁልፎች',

  home: 'ዋና',
  orders: 'ትዕዛዞች',
  affiliate: 'አጋር',
  support: 'ድጋፍ',

  heroTitle: 'ፕሪሚየም ዲጂታል ቁልፎች',
  heroSub: 'በቻፓ ይክፈሉ • ወዲያውኑ ይቀበሉ',
  searchPlaceholder: 'ፈልግ…',
  all: 'ሁሉም',
  instant: 'ወዲያውኑ',
  secure: 'የተረጋገጠ',
  original: 'ኦሪጅናል',
  empty: 'ምርት አልተገኘም',
  loading: 'በመጫን ላይ…',

  buy: 'ግዛ',
  soldOut: 'አልቋል',
  inStock: 'አለ',
  keys: 'ቁልፎች',
  left: 'ብቻ ቀርተዋል',
  only: 'ብቻ!',
  refApplied: 'የአጋር ሪፈራል ተግብሯል',
  paymentMethods: 'ቻፓ — ቴሌብር • CBE Birr • ካርድ',
  instantKeyHint: 'ክፍያ እንደፈጸሙ ቁልፉ ወዲያውኑ ይላካል',
  shareMsg: '🔑 ፕሪሚየም ዲጂታል ቁልፎች በተመጣጣኝ ዋጋ — እዚህ ይግዙ!',
  shareOnTelegram: 'በቴሌግራም አጋራ',
  noSalesYet: 'ገና ሽያጭ የለም — ሊንክዎን ያጋሩ!',
  namePlaceholder: 'አበበ በቀለ',
  liveHint: 'ለእውነተኛ ክፍያ PAYMENT_MODE=live እና የቻፓ ቁልፍ ያስፈልጋል።',
  oneTapHint: 'ስም ወይም ስልክ አያስፈልግም — የቴሌግራም መለያዎ ብቻ ይበቃል',
  joinViaTelegram: 'ፕራይም ስቶርን በቴሌግራም ክፈተው ወዲያውኑ ይቀላቀሉ',
  features: 'ባህሪያት',
  requirements: 'መስፈርቶች',
  fullName: 'ስም',
  email: 'ኢሜይል',
  phone: 'ስልክ',
  payNow: 'ይክፈሉ',
  connecting: 'በመገናኘት ላይ…',
  back: 'ተመለስ',
  next: 'ቀጣይ',
  share: 'አጋራ',
  total: 'ዋጋ',

  paidSuccess: 'ግዢ ተጠናቋል!',
  verifying: 'ክፍያ በማረጋገጥ ላይ…',
  orderNo: 'ትዕዛዝ',
  yourKey: 'የእርስዎ ቁልፍ',
  copy: 'ኮፒ',
  copied: 'ተቀድቷል!',
  activation: 'አክቲቬሽን',
  download: 'ዳውንሎድ',
  note: 'ማስታወሻ',
  checkStatus: 'ሁኔታ አድስ',
  payNowShort: 'ክፈል',
  pendingHint: 'ክፍያ ከፈጸሙ "ሁኔታ አድስ" ይጫኑ።',

  // Delivery guide (account-delivery products)
  loginTo: 'ይግቡ',
  openInbox: 'የመለያ ኢሜይል',
  inboxHint: 'የመግቢያ ኮዶች እዚህ ይመጣሉ',
  password: 'የይለፍ ቃል',
  emailPassword: 'የኢሜይል የይለፍ ቃል',
  open: 'ክፈት',
  account: 'መለያ',
  yourAccounts: 'መለያዎችዎ',
  useOneBelow: 'ከታች ካሉት መለያዎች አንዱን ይጠቀሙ',
  vpnStep: 'መጀመሪያ VPN ያብሩ',
  vpnHint: 'በኢትዮጵያ ያስፈልጋል',

  myOrders: 'ትዕዛዞቼ',
  paid: 'ተከፍሏል',
  pending: 'በጥበቃ',
  noOrders: 'ትዕዛዝ የለም',
  emailHint: 'በግዢዎ ኢሜይል ይፈልጉ',
  findOrders: 'ፈልግ',
  viewKey: 'ቁልፍ ይመልከቱ',

  becomeAffiliate: 'በጋራ እንስራ',
  affiliateHero: 'ሊንክዎን ያጋሩ፣ ኮሚሽን ያግኙ',
  affiliateSub: 'ከእያንዳንዱ ሽያጭ 10% ኮሚሽን ያግኙ',
  joinNow: 'አሁኑኑ ይጀምሩ',
  payoutMethod: 'ገንዘብ መቀበያ መንገድ',
  telebirr: 'ቴሌብር',
  cbe: 'CBE Birr',
  yourLink: 'መጋበዣ ሊንክዎ',
  clicks: 'ጠቅታዎች',
  sales: 'የተሸጠ',
  pendingEarnings: 'ያልተከፈለ ገቢ',
  paidEarnings: 'የተከፈለ ገቢ',
  totalEarned: 'ጠቅላላ ገቢ',
  howItWorks: 'እንዴት ነው የሚሰራው?',
  step1: 'ተመዝግበው የራስዎን ሊንክ ያግኙ',
  step2: 'ሊንክዎን ለሌሎች ያጋሩ',
  step3: 'በሊንክዎ ሲገዙ ኮሚሽን ያግኙ',
  rate: 'የኮሚሽን መጠን',
  recentSales: 'የቅርብ ጊዜ ሽያጮች',
  joining: 'በመመዝገብ ላይ…',
  requestPayout: 'ክፍያ ጠይቅ',
  choosePayoutMethod: 'ክፍያዎን እንዴት እንልክልዎ?',
  telebirrPhone: 'የቴሌብር ስልክ ቁጥር',
  cbeAccount: 'የ CBE የባንክ ቁጥር',
  submitRequest: 'ጥያቄ ላክ',
  payoutSubmitted: 'ጥያቄዎ ደርሷል!',
  payoutSubmittedHint: 'ክፍያዎ በቅርቡ ይላካል',
  continue: 'ቀጥል',
  youllReceive: 'ይደርስዎታል',

  testMode: 'የሙከራ ሞድ',
  mockCheckout: 'የቻፓ ሙከራ ክፍያ',
  mockHint: 'እውነተኛ ገንዘብ አይከፈልም',
  paySuccess: 'ክፈል (ሙከራ)',
  cancelPayment: 'ሰርዝ',
  selectMethod: 'የክፍያ መንገድ ይምረጡ',
  card: 'ካርድ',

  cart: 'እቃ',
  addToCart: 'ወደ እቃ ጨምር',
  addedToCart: 'ተጨምሯል!',
  cartEmpty: 'የቅርጫት ካርታዎ ባዶ ነው',
  goShopping: 'ሱቁን ይመልከቱ',
  checkout: 'ክፈል',
  quantity: 'ብዛት',
  remove: 'አስወግድ',
  subtotal: 'ድምር',
  items: 'እቃዎች',
  continueShopping: 'ሌላ ጨምር',

  chooseLanguage: 'ቋንቋ ይምረጡ',
  languageSub: 'በላይኛው አሞሌ ላይ ማንኛውንም ጊዜ መቀየር ይችላሉ',

  errorGeneric: 'ስህተት ተፈጥሯል',
  retry: 'እንደገና',
};

export const translations: Record<Lang, Dict> = { en, am };

// ---------- persistence + reactive store ----------
const LANG_KEY = 'kv_lang';
const CHOSEN_KEY = 'kv_lang_chosen';
const LANG_EVENT = 'kv_lang_changed';
const DEFAULT_LANG: Lang = 'am';

export function getStoredLang(): Lang {
  try {
    const raw = localStorage.getItem(LANG_KEY) as Lang | null;
    return raw && translations[raw] ? raw : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

export function hasChosenLanguage(): boolean {
  try {
    return localStorage.getItem(CHOSEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function setLanguage(lang: Lang, markChosen = true) {
  try {
    localStorage.setItem(LANG_KEY, lang);
    if (markChosen) localStorage.setItem(CHOSEN_KEY, '1');
    window.dispatchEvent(new CustomEvent(LANG_EVENT));
  } catch {}
}

/** Reactive current language — re-renders on change, SSR-safe. */
export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);
  useEffect(() => {
    setLang(getStoredLang());
    const onChange = () => setLang(getStoredLang());
    window.addEventListener(LANG_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(LANG_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return lang;
}

/** Reactive translation dictionary for the current language. */
export function useT(): Dict {
  const lang = useLang();
  return translations[lang] || translations.am;
}
