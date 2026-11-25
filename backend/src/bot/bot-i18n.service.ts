import { Injectable } from '@nestjs/common';
import { ReplyButton } from '../telegram/telegram.service';
import { BotEmojiService } from './bot-emoji.service';

export type BotLang = 'en' | 'am';

const STRINGS = {
  en: {
    btnShop: 'Shop',
    btnOrders: 'My Orders',
    btnInvite: 'Invite & Earn',
    btnSearch: 'Search',
    btnLang: 'አማ / EN',
    btnHelp: 'Support',
    welcomeTitle: 'Access Store',
    welcomeSub: 'Instant digital keys &amp; AI APIs · Pay instant in Birr',
    pickCategory: 'Choose a category',
    allProducts: 'All Products',
    shopCategory: 'Shop',
    apiCategory: 'API Products',
    vpnCategory: 'VPNs',
    featuredGemini: 'Featured Gemini',
    featured: 'Featured',
    inStock: 'In stock',
    outOfStock: 'Out of stock',
    instantDelivery: 'Instant',
    buyNow: 'Buy Now',
    notifyMe: 'Notify When Back',
    notifyOn: 'Notify Enabled',
    notifyDone: "You're on the restock list! We'll DM you when it's back.",
    qtyLabel: 'Qty',
    priceLabel: 'Price',
    stockLabel: 'In stock',
    piecesUnit: 'pcs',
    outOfStockNote: 'Currently out of stock — tap below to get notified!',
    deliveryLabel: 'Delivery',
    instantDeliveryText: 'Instant auto-delivery',
    warrantyLabel: 'Warranty',
    warrantyAvailable: 'Warranty available',
    descLabel: 'Description',
    benefitsLabel: 'Benefits',
    requirementsLabel: 'Requirements',
    guideLabel: 'Activation Preview',
    updatedLabel: 'Updated',
    useCreditBtn: 'Use {amt} ETB Credit',
    refreshBtn: 'Refresh',
    shareBtn: 'Share',
    backBtn: 'Back',
    searchPrompt: 'Send the product name you are looking for (e.g. <i>Gemini</i>, <i>Canva</i>, <i>Spotify</i>):',
    searchEmpty: 'No matching products found. Try another keyword.',
    ordersTitle: 'My Orders',
    noOrders: 'You have no orders yet. Tap Shop to grab your first key!',
    langSwitched: 'Language switched to <b>English</b>.',
    helpText:
      '<b>Help &amp; Support</b>\n\n' +
      '• Tap <b>Shop</b> to browse products and tap <b>Buy Now</b> to pay instant in Birr right inside Telegram.\n' +
      '• Keys &amp; accounts arrive instantly in your Orders &amp; chat after payment.\n' +
      '• Tap <b>Invite &amp; Earn</b> to share your link and unlock free rewards!',
  },
  am: {
    btnShop: 'ሱቅ',
    btnOrders: 'ትዕዛዞቼ',
    btnInvite: 'ጋብዘው ይሸለሙ',
    btnSearch: 'ፈልግ',
    btnLang: 'EN / አማ',
    btnHelp: 'እርዳታ',
    welcomeTitle: 'Access Store',
    welcomeSub: 'ፈጣን ዲጂታል ቁልፎች እና AI API · በብር ወዲያውኑ ይክፈሉ',
    pickCategory: 'ምድብ ይምረጡ',
    allProducts: 'ሁሉም ምርቶች',
    shopCategory: 'ሱቅ',
    apiCategory: 'የAPI ምርቶች',
    vpnCategory: 'VPN አገልግሎቶች',
    featuredGemini: 'ተመራጭ Gemini',
    featured: 'ተወዳጅ',
    inStock: 'ይገኛል',
    outOfStock: 'አልቋል',
    instantDelivery: 'ፈጣን',
    buyNow: 'አሁን ይግዙ',
    notifyMe: 'ሲመለስ አሳውቀኝ',
    notifyOn: 'ማሳወቂያ በርቷል',
    notifyDone: 'ተመዝግበዋል! ምርቱ ሲመለስ ወዲያውኑ መልዕክት እንልክልዎታለን።',
    qtyLabel: 'ብዛት',
    priceLabel: 'ዋጋ',
    stockLabel: 'ክምችት',
    piecesUnit: 'ፍሬ',
    outOfStockNote: 'አሁን አልቋል — ሲመለስ እንድናሳውቅዎ ከታች ይጫኑ!',
    deliveryLabel: 'አቅርቦት',
    instantDeliveryText: 'ፈጣን ራስ-ሰር መላኪያ',
    warrantyLabel: 'ዋስትና',
    warrantyAvailable: 'ዋስትና አለው',
    descLabel: 'መግለጫ',
    benefitsLabel: 'ጥቅሞች',
    requirementsLabel: 'መስፈርቶች',
    guideLabel: 'አጠቃቀም',
    updatedLabel: 'የተዘመነው',
    useCreditBtn: '{amt} ETB ክሬዲት ይጠቀሙ',
    refreshBtn: 'አድስ',
    shareBtn: 'አጋራ',
    backBtn: 'ተመለስ',
    searchPrompt: 'የሚፈልጉትን ምርት ስም ይጻፉ (ለምሳሌ: <i>Gemini</i>, <i>Canva</i>, <i>Spotify</i>):',
    searchEmpty: 'ተመሳሳይ ምርት አልተገኘም። ሌላ ቃል ይሞክሩ።',
    ordersTitle: 'ትዕዛዞቼ',
    noOrders: 'እስካሁን ምንም ትዕዛዝ የለዎትም። ሱቁን በመክፈት ይግዙ!',
    langSwitched: 'ቋንቋ ወደ <b>አማርኛ</b> ተቀይሯል።',
    helpText:
      '<b>እርዳታ እና ድጋፍ</b>\n\n' +
      '• <b>ሱቅ</b> በመጫን ምርቶችን ይመልከቱ እና <b>አሁን ይግዙ</b> በመጫን በብር ወዲያውኑ ይክፈሉ።\n' +
      '• ክፍያ እንደተፈጸመ ቁልፍዎ ወዲያውኑ እዚህ ይላካል።\n' +
      '• <b>ጋብዘው ይሸለሙ</b> በመጫን ጓደኞችዎን ይጋብዙና ነጻ ሽልማቶችን ይክፈቱ!',
  },
} as const;

@Injectable()
export class BotI18nService {
  constructor(private readonly emojis: BotEmojiService) {}

  normalizeLang(code?: string | null): BotLang {
    return code === 'am' ? 'am' : 'en';
  }

  t(lang: BotLang) {
    return STRINGS[lang] || STRINGS.en;
  }

  private dockLabel(role: Parameters<BotEmojiService['resolveId']>[0], fallbackEmoji: string, label: string) {
    // If custom emoji icon is present on the button, keep label clean; else prepend standard emoji
    return this.emojis.resolveId(role) ? label : `${fallbackEmoji} ${label}`;
  }

  mainReplyKeyboard(lang: BotLang) {
    const s = this.t(lang);
    const keyboard: ReplyButton[][] = [
      [
        {
          text: this.dockLabel('shop', '🛍', s.btnShop),
          style: 'primary',
          ...this.emojis.btnIcon('shop'),
        },
        {
          text: this.dockLabel('orders', '📦', s.btnOrders),
          ...this.emojis.btnIcon('orders'),
        },
      ],
      [
        {
          text: this.dockLabel('invite', '🎁', s.btnInvite),
          style: 'success',
          ...this.emojis.btnIcon('invite'),
        },
        {
          text: this.dockLabel('search', '🔍', s.btnSearch),
          ...this.emojis.btnIcon('search'),
        },
      ],
      [
        {
          text: this.dockLabel('lang', '🌐', s.btnLang),
          ...this.emojis.btnIcon('lang'),
        },
        {
          text: this.dockLabel('support', '❓', s.btnHelp),
          ...this.emojis.btnIcon('support'),
        },
      ],
    ];
    return {
      keyboard,
      resize_keyboard: true,
      is_persistent: true,
    };
  }

  /** Detect if a text message matches any localized Reply Keyboard button (with or without fallback emoji). */
  matchReplyButton(text: string): 'SHOP' | 'ORDERS' | 'INVITE' | 'SEARCH' | 'LANG' | 'HELP' | null {
    const t = (text || '').trim();
    for (const lang of ['en', 'am'] as BotLang[]) {
      const s = STRINGS[lang];
      if (t === s.btnShop || t.endsWith(` ${s.btnShop}`)) return 'SHOP';
      if (t === s.btnOrders || t.endsWith(` ${s.btnOrders}`)) return 'ORDERS';
      if (t === s.btnInvite || t.endsWith(` ${s.btnInvite}`)) return 'INVITE';
      if (t === s.btnSearch || t.endsWith(` ${s.btnSearch}`)) return 'SEARCH';
      if (t === s.btnLang || t.endsWith(` ${s.btnLang}`)) return 'LANG';
      if (t === s.btnHelp || t.endsWith(` ${s.btnHelp}`)) return 'HELP';
    }
    return null;
  }

  localizeProduct(product: any, lang: BotLang) {
    const tr = product?.translations?.[lang] || {};
    const guideSteps: string[] = Array.isArray(tr.activationSteps) && tr.activationSteps.length > 0
      ? tr.activationSteps
      : Array.isArray(product?.activationGuide?.steps)
        ? product.activationGuide.steps
        : [];
    return {
      name: (tr.name || product?.name || '').trim(),
      shortDesc: (tr.shortDesc || product?.shortDesc || '').trim(),
      description: (tr.description || product?.description || '').trim(),
      features: (Array.isArray(tr.features) && tr.features.length > 0 ? tr.features : product?.features || []) as string[],
      requirements: (Array.isArray(tr.requirements) && tr.requirements.length > 0
        ? tr.requirements
        : product?.requirements || []) as string[],
      activationSteps: guideSteps,
    };
  }
}
