import { Injectable } from '@nestjs/common';
import { ReplyButton } from '../telegram/telegram.service';

export type BotLang = 'en' | 'am';

const STRINGS = {
  en: {
    btnShop: '🛍 Shop',
    btnOrders: '📦 My Orders',
    btnInvite: '🎁 Invite & Earn',
    btnSearch: '🔍 Search',
    btnLang: '🌐 አማ / EN',
    btnHelp: '❓ Support',
    welcomeTitle: 'Access Store',
    welcomeSub: 'Instant digital keys · Pay with Chapa inside Telegram',
    pickCategory: 'Choose a category',
    allProducts: 'All Products',
    featured: 'Featured',
    inStock: 'In stock',
    outOfStock: 'Out of stock',
    instantDelivery: 'Instant',
    buyNow: 'Buy Now',
    notifyMe: 'Notify Me When Back',
    notifyDone: "You're on the restock list! We'll DM you when it's back.",
    searchPrompt: '🔍 Send the product name you are looking for (e.g. <i>Gemini</i>, <i>Canva</i>, <i>VPN</i>):',
    searchEmpty: 'No matching products found. Try another keyword.',
    ordersTitle: 'My Orders',
    noOrders: 'You have no orders yet. Tap Shop to grab your first key!',
    langSwitched: '🌐 Language switched to <b>English</b>.',
    helpText:
      '❓ <b>Help &amp; Support</b>\n\n' +
      '• Tap <b>🛍 Shop</b> to browse products and tap <b>⚡ Buy Now</b> to pay with Chapa right inside Telegram.\n' +
      '• Keys &amp; accounts arrive instantly in your Orders &amp; chat after payment.\n' +
      '• Tap <b>🎁 Invite &amp; Earn</b> to share your link and unlock free rewards!',
  },
  am: {
    btnShop: '🛍 ሱቅ',
    btnOrders: '📦 ትዕዛዞቼ',
    btnInvite: '🎁 ጋብዘው ይሸለሙ',
    btnSearch: '🔍 ፈልግ',
    btnLang: '🌐 EN / አማ',
    btnHelp: '❓ እርዳታ',
    welcomeTitle: 'Access Store',
    welcomeSub: 'ፈጣን ዲጂታል ቁልፎች · በቻፓ እዚሁ ቴሌግራም ውስጥ ይክፈሉ',
    pickCategory: 'ምድብ ይምረጡ',
    allProducts: 'ሁሉም ምርቶች',
    featured: 'ተወዳጅ',
    inStock: 'ይገኛል',
    outOfStock: 'አልቋል',
    instantDelivery: 'ፈጣን',
    buyNow: 'አሁን ይግዙ',
    notifyMe: 'ሲመለስ አሳውቀኝ',
    notifyDone: 'ተመዝግበዋል! ምርቱ ሲመለስ ወዲያውኑ መልዕክት እንልክልዎታለን።',
    searchPrompt: '🔍 የሚፈልጉትን ምርት ስም ይጻፉ (ለምሳሌ: <i>Gemini</i>, <i>Canva</i>, <i>VPN</i>):',
    searchEmpty: 'ተመሳሳይ ምርት አልተገኘም። ሌላ ቃል ይሞክሩ።',
    ordersTitle: 'ትዕዛዞቼ',
    noOrders: 'እስካሁን ምንም ትዕዛዝ የለዎትም። ሱቁን በመክፈት ይግዙ!',
    langSwitched: '🌐 ቋንቋ ወደ <b>አማርኛ</b> ተቀይሯል።',
    helpText:
      '❓ <b>እርዳታ እና ድጋፍ</b>\n\n' +
      '• <b>🛍 ሱቅ</b> በመጫን ምርቶችን ይመልከቱ እና <b>⚡ አሁን ይግዙ</b> በመጫን በቻፓ እዚሁ ይክፈሉ።\n' +
      '• ክፍያ እንደተፈጸመ ቁልፍዎ ወዲያውኑ እዚህ ይላካል።\n' +
      '• <b>🎁 ጋብዘው ይሸለሙ</b> በመጫን ጓደኞችዎን ይጋብዙና ነጻ ሽልማቶችን ይክፈቱ!',
  },
} as const;

@Injectable()
export class BotI18nService {
  normalizeLang(code?: string | null): BotLang {
    return code === 'am' ? 'am' : 'en';
  }

  t(lang: BotLang) {
    return STRINGS[lang] || STRINGS.en;
  }

  mainReplyKeyboard(lang: BotLang) {
    const s = this.t(lang);
    const keyboard: ReplyButton[][] = [
      [
        { text: s.btnShop, style: 'primary' },
        { text: s.btnOrders },
      ],
      [
        { text: s.btnInvite, style: 'success' },
        { text: s.btnSearch },
      ],
      [
        { text: s.btnLang },
        { text: s.btnHelp },
      ],
    ];
    return {
      keyboard,
      resize_keyboard: true,
      is_persistent: true,
    };
  }

  /** Detect if a text message matches any localized Reply Keyboard button. */
  matchReplyButton(text: string): 'SHOP' | 'ORDERS' | 'INVITE' | 'SEARCH' | 'LANG' | 'HELP' | null {
    const t = (text || '').trim();
    for (const lang of ['en', 'am'] as BotLang[]) {
      const s = STRINGS[lang];
      if (t === s.btnShop) return 'SHOP';
      if (t === s.btnOrders) return 'ORDERS';
      if (t === s.btnInvite) return 'INVITE';
      if (t === s.btnSearch) return 'SEARCH';
      if (t === s.btnLang) return 'LANG';
      if (t === s.btnHelp) return 'HELP';
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
