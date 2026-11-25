import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { HomeCardsService } from '../home-cards/home-cards.service';
import { OrdersService } from '../orders/orders.service';
import { StockAlertsService } from '../stock-alerts/stock-alerts.service';
import { PaymentsService } from '../payments/payments.service';
import { UsersService } from '../users/users.service';
import { SupplierService } from '../supplier/supplier.service';
import {
  TelegramService,
  InlineButton,
  escapeHtml,
  tgEmoji,
} from '../telegram/telegram.service';
import { BotI18nService, BotLang } from './bot-i18n.service';
import { BotStateService } from './bot-state.service';
import { BotEmojiService } from './bot-emoji.service';
import { formatDeliveryForTelegram } from './bot-delivery.formatter';

const PAGE_SIZE = 10;

@Injectable()
export class BotMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly homeCards: HomeCardsService,
    private readonly orders: OrdersService,
    private readonly stockAlerts: StockAlertsService,
    private readonly payments: PaymentsService,
    private readonly users: UsersService,
    private readonly supplier: SupplierService,
    private readonly telegram: TelegramService,
    private readonly i18n: BotI18nService,
    private readonly state: BotStateService,
    private readonly emojis: BotEmojiService,
  ) {}

  private cleanDescriptionAndWarranty(raw: string, title = ''): { text: string; hasWarranty: boolean } {
    const cleaned = (raw || '')
      .replace(/(?:ℹ️|⚠️|📌|•|\*|-|\s)*(?:\bno warranty\b|\bwithout warranty\b|\bwarranty:\s*none\b|\b0\s*days?\s*warranty\b|ዋስትና የለውም|ዋስትና የለም|ያለ ዋስትና)[^\n.!]*[.!]?/giu, '')
      .replace(/\s*[·•|]\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const combined = `${title}\n${cleaned}`;
    const hasWarranty =
      /(?:\b(?:full|lifetime|\d+\s*(?:day|days|d|month|months|m|year|years|y)|replacement)\s+warranty\b|\bwarranty\s*(?:included|available|covered)\b|ዋስትና\s*አለው|ሙሉ\s*ዋስትና)/iu.test(
        combined,
      );
    return { text: cleaned, hasWarranty };
  }

  private async showOrEditText(
    chatId: string | number,
    text: string,
    markup: any,
    messageId?: number,
    wasPhoto?: boolean,
  ) {
    if (messageId && !wasPhoto) {
      const edited = await this.telegram.editMessageText(chatId, messageId, text, markup);
      if (edited) return;
    }
    if (messageId && wasPhoto) {
      await this.telegram.deleteMessage(chatId, messageId);
    }
    await this.telegram.sendMessage(chatId, text, markup);
  }

  async sendWelcomeDock(chatId: string | number, lang: BotLang, firstName?: string) {
    const s = this.i18n.t(lang);
    const wave = this.emojis.html('fire', '👋');
    const keyIcon = this.emojis.html('store', '🔑');
    const greet =
      lang === 'am'
        ? `${wave} ሰላም <b>${escapeHtml(firstName || 'ወዳጅ')}</b>!`
        : `${wave} Welcome, <b>${escapeHtml(firstName || 'Friend')}</b>!`;
    await this.telegram.sendMessage(
      chatId,
      `${greet}\n${keyIcon} <b>${s.welcomeTitle}</b>`,
      this.i18n.mainReplyKeyboard(lang),
    );
  }

  async showHome(chatId: string | number, telegramId: string, lang: BotLang, messageId?: number, wasPhoto?: boolean) {
    await this.emojis.warmUiPacks();
    const s = this.i18n.t(lang);
    const [categories, allProducts, tgUser] = await Promise.all([
      this.products.getCategories(),
      this.products.findAll(),
      this.prisma.tgUser.findUnique({ where: { telegramId } }),
    ]);

    const vipPct = Math.min(95, Math.max(0, Number(tgUser?.customDiscountPct || 0)));

    const vipBadge =
      vipPct > 0
        ? `${this.emojis.html('crown', '👑')} VIP Discount: <b>${vipPct}% OFF</b>\n`
        : '';
    const creditBadge =
      tgUser?.storeCredit && tgUser.storeCredit > 0
        ? `${this.emojis.html('money', '💰')} Store Credit: <b>${tgUser.storeCredit.toLocaleString()} ETB</b>\n`
        : '';

    const text =
      `${this.emojis.html('store', '💎')} <b>${s.welcomeTitle}</b>\n` +
      `${this.emojis.html('shield', '🛡')} <i>${s.welcomeSub}</i>\n\n` +
      vipBadge +
      creditBadge +
      `${this.emojis.html('fire', '⚡')} <b>${s.featuredGemini}</b>`;

    const keyboard: InlineButton[][] = [];

    // Home shows ONLY Gemini product(s) in the featured product buttons
    const geminiProducts = allProducts.filter(
      (p: any) => /gemini/i.test(p.name || '') || /gemini/i.test(p.slug || ''),
    );

    for (const p of geminiProducts.slice(0, 4)) {
      const loc = this.i18n.localizeProduct(p, lang);
      const finalPrice = vipPct > 0 ? Math.max(1, Math.round(p.price * (1 - vipPct / 100))) : p.price;
      const emojiId = this.emojis.productEmojiId(p);
      keyboard.push([
        {
          text: `${loc.name} · ${Number(finalPrice).toLocaleString()} ${p.currency || 'ETB'}`.slice(0, 56),
          callback_data: `p:${p.id}`,
          style: p.stock > 0 ? 'primary' : undefined,
          ...(emojiId ? { icon_custom_emoji_id: emojiId } : {}),
        },
      ]);
    }

    // Home categories: Shop & API Products
    const apiCat = (categories as any[]).find((cat) => cat.slug === 'api-products');
    const apiEmojiId = apiCat?.emojiId || '5978699612536448673';
    keyboard.push([
      {
        text: `${s.shopCategory} (${allProducts.length})`,
        callback_data: 'c:all:0',
        style: 'primary',
        ...this.emojis.btnIcon('shop'),
      },
      {
        text: apiCat?._count?.products ? `${s.apiCategory} (${apiCat._count.products})` : s.apiCategory,
        callback_data: 'c:api-products:0',
        style: 'primary',
        ...this.emojis.btnIcon('affiliate', apiEmojiId),
      },
    ]);

    // Any extra custom categories beyond digital-products & api-products
    const extraCats = (categories as any[]).filter(
      (cat) => cat.slug !== 'digital-products' && cat.slug !== 'api-products' && (cat._count?.products ?? 1) > 0,
    );
    for (let i = 0; i < extraCats.length; i += 2) {
      keyboard.push(
        extraCats.slice(i, i + 2).map((cat) => {
          const isVpn = cat.slug === 'vpns';
          const count = cat._count?.products;
          const label = isVpn ? `${s.vpnCategory}${count ? ` (${count})` : ''}` : cat.name;
          return {
            text: label,
            callback_data: `c:${cat.slug}:0`,
            ...(isVpn ? { style: 'primary' as const, ...this.emojis.btnIcon('shield') } : this.emojis.btnIcon('product', cat.emojiId)),
          };
        }),
      );
    }

    keyboard.push([
      {
        text: lang === 'am' ? 'ጋብዘው ይሸለሙ' : 'Invite & Unlock',
        callback_data: 'rew:home',
        style: 'success',
        ...this.emojis.btnIcon('reward'),
      },
      {
        text: s.btnOrders,
        callback_data: 'ord:0',
        ...this.emojis.btnIcon('orders'),
      },
    ]);

    keyboard.push([
      {
        text: s.btnSearch,
        callback_data: 'srch:go',
        ...this.emojis.btnIcon('search'),
      },
    ]);

    await this.showOrEditText(chatId, text, { inline_keyboard: keyboard }, messageId, wasPhoto);
  }

  /** Buttons-only catalog: crisp header in text, all products cleanly inside colored icon buttons. */
  async showCatalog(
    chatId: string | number,
    telegramId: string,
    lang: BotLang,
    categorySlug: string,
    page = 0,
    messageId?: number,
    wasPhoto?: boolean,
  ) {
    await this.emojis.warmUiPacks();
    const s = this.i18n.t(lang);
    const [all, tgUser] = await Promise.all([
      this.products.findAll(categorySlug === 'featured' || categorySlug === 'all' ? undefined : categorySlug),
      this.prisma.tgUser.findUnique({ where: { telegramId } }),
    ]);

    void this.users.trackEvent({ telegramId, eventType: 'CATEGORY_VIEW', categorySlug });

    const filtered = categorySlug === 'featured' ? all.filter((p: any) => p.isFeatured) : all;
    // Owner-defined showcase order: Gemini → Coursera → Duolingo → Adobe → APIs → rest
    const priority = (p: any): number => {
      const n = String(p?.name || '').toLowerCase();
      if (n.includes('gemini')) return 0;
      if (n.includes('coursera')) return 1;
      if (n.includes('duolingo')) return 2;
      if (n.includes('adobe')) return 3;
      if (/\bapi\b/.test(n)) return 4;
      return 5;
    };
    const sorted = [...filtered].sort((a, b) => priority(a) - priority(b));
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const slice = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
    const vipPct = Math.min(95, Math.max(0, Number(tgUser?.customDiscountPct || 0)));

    await this.state.setState(telegramId, { lastCategorySlug: categorySlug });

    if (slice.length === 0) {
      const emptyHeader =
        categorySlug === 'api-products'
          ? `${tgEmoji('5978699612536448673', '🔌')} <b>${s.apiCategory}</b>`
          : `${this.emojis.html('orders', '📭')} <b>${s.allProducts}</b>`;
      const emptyNote =
        categorySlug === 'api-products'
          ? lang === 'am'
            ? 'የAPI ምርቶች በቅርቡ ይጨመራሉ — ለአሁኑ ሱቁን ይመልከቱ!'
            : 'Claude, Codex &amp; AI API keys dropping soon — tap Shop to browse available items!'
          : lang === 'am'
            ? 'በዚህ ምድብ ውስጥ እስካሁን ምርት የለም።'
            : 'No products in this category yet.';
      await this.showOrEditText(
        chatId,
        `${emptyHeader}\n\n<i>${emptyNote}</i>`,
        {
          inline_keyboard: [
            [{ text: s.shopCategory, callback_data: 'c:all:0', style: 'primary', ...this.emojis.btnIcon('shop') }],
            [{ text: s.backBtn, callback_data: 'h:0', ...this.emojis.btnIcon('back') }],
          ],
        },
        messageId,
        wasPhoto,
      );
      return;
    }

    const title =
      categorySlug === 'all'
        ? `${this.emojis.html('shop', '🛍')} <b>${s.allProducts}</b>`
        : categorySlug === 'api-products'
          ? `${tgEmoji('5978699612536448673', '🔌')} <b>${s.apiCategory}</b>`
          : categorySlug === 'vpns'
            ? `${this.emojis.html('shield', '🛡')} <b>${s.vpnCategory}</b>`
            : categorySlug === 'featured'
              ? `${this.emojis.html('featured', '⭐')} <b>${s.featured}</b>`
              : `${this.emojis.html('product', '📂')} <b>${escapeHtml(categorySlug.toUpperCase())}</b>`;

    const subtitle =
      lang === 'am'
        ? 'ዝርዝሩን ለማየት እና ለመግዛት ከታች አንዱን ይጫኑ 👇'
        : 'Select a product below to view &amp; buy 👇';

    const text = `${title} · <b>${filtered.length}</b>\n<i>${subtitle}</i>`;

    const keyboard: InlineButton[][] = slice.map((p: any) => {
      const loc = this.i18n.localizeProduct(p, lang);
      const finalPrice = vipPct > 0 ? Math.max(1, Math.round(p.price * (1 - vipPct / 100))) : p.price;
      const emojiId = this.emojis.productEmojiId(p);
      const label = `${loc.name} · ${Number(finalPrice).toLocaleString()} ${p.currency || 'ETB'}`.slice(0, 56);
      return [
        {
          text: label,
          callback_data: `p:${p.id}`,
          style: p.stock > 0 ? 'primary' : 'danger',
          ...(emojiId ? { icon_custom_emoji_id: emojiId } : {}),
        },
      ];
    });

    if (totalPages > 1) {
      const navRow: InlineButton[] = [];
      if (safePage > 0) navRow.push({ text: '‹', callback_data: `c:${categorySlug}:${safePage - 1}` });
      navRow.push({ text: `${safePage + 1}/${totalPages}`, callback_data: 'noop' });
      if (safePage < totalPages - 1) {
        navRow.push({ text: '›', callback_data: `c:${categorySlug}:${safePage + 1}` });
      }
      keyboard.push(navRow);
    }

    keyboard.push([
      { text: 'Home', callback_data: 'h:0', ...this.emojis.btnIcon('home') },
      { text: 'Search', callback_data: 'srch:go', ...this.emojis.btnIcon('search') },
    ]);

    await this.showOrEditText(chatId, text, { inline_keyboard: keyboard }, messageId, wasPhoto);
  }

  async showProduct(
    chatId: string | number,
    telegramId: string,
    lang: BotLang,
    productId: string,
    qty = 1,
    messageId?: number,
    wasPhoto?: boolean,
    trackView = true,
  ) {
    await this.emojis.warmUiPacks();
    let product: any;
    try {
      product = await this.products.findOne(productId);
    } catch {
      await this.telegram.sendMessage(chatId, '❌ Product not found.');
      return;
    }

    if (trackView) {
      void this.users.trackEvent({
        telegramId,
        eventType: 'PRODUCT_VIEW',
        productId: product.id,
        productName: product.name,
        categorySlug: product.category?.slug || null,
      });
    }

    const [userState, tgUser, notifyOn] = await Promise.all([
      this.state.getState(telegramId),
      this.prisma.tgUser.findUnique({ where: { telegramId } }),
      product.stock <= 0 ? this.stockAlerts.isSubscribed(product.id, telegramId) : Promise.resolve(false),
    ]);

    const s = this.i18n.t(lang);
    const loc = this.i18n.localizeProduct(product, lang);
    const safeQty = Math.max(1, Math.min(product.stock > 0 ? Math.min(50, product.stock) : 1, qty));
    const vipPct = Math.min(95, Math.max(0, Number(tgUser?.customDiscountPct || 0)));
    const unitPrice =
      vipPct > 0 ? Math.max(1, Math.round(Number(product.price) * (1 - vipPct / 100))) : Number(product.price || 0);
    const total = unitPrice * safeQty;

    const prodEmojiId = this.emojis.productEmojiId(product);
    const icon = prodEmojiId ? tgEmoji(prodEmojiId, '🔑') : this.emojis.html('key', '🔑');
    const descIcon = this.emojis.html(lang === 'am' ? 'lang' : 'details', '📝');
    const starIcon = this.emojis.html('featured', '✨');
    const shieldIcon = this.emojis.html('shield', '🛡');
    const fireIcon = this.emojis.html('fire', '⚡');
    const moneyIcon = this.emojis.html('money', '💵');
    const stockIcon = this.emojis.html(product.stock > 0 ? 'rocket' : 'pending', '📦');
    const timeIcon = this.emojis.html('pending', '🕒');
    const checkIcon = this.emojis.html('success', '✅');

    const compareBase = vipPct > 0 ? product.price : product.originalPrice;
    const orig =
      compareBase && compareBase > unitPrice
        ? ` <s>${Number(compareBase).toLocaleString()} ${product.currency}</s>`
        : '';
    const discountPct =
      compareBase && compareBase > unitPrice ? Math.round((1 - unitPrice / compareBase) * 100) : 0;

    const { text: cleanDesc, hasWarranty } = this.cleanDescriptionAndWarranty(
      loc.description || loc.shortDesc || product.description || '',
      loc.name || product.name,
    );

    const featureLines = (loc.features || [])
      .map((f) => this.cleanDescriptionAndWarranty(f).text)
      .filter(Boolean)
      .slice(0, 5)
      .map((f) => `${checkIcon} ${escapeHtml(f)}`)
      .join('\n');
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false });

    const parts: string[] = [
      `${icon} <b>${escapeHtml(loc.name || product.name)}</b>`,
    ];
    if (cleanDesc) {
      parts.push(`${descIcon} <b>${s.descLabel}:</b>\n${escapeHtml(cleanDesc)}`);
    }
    if (featureLines) {
      parts.push(`${starIcon} <b>${s.benefitsLabel}:</b>\n${featureLines}`);
    }
    parts.push(
      `${moneyIcon} <b>${s.priceLabel}:</b> <b>${unitPrice.toLocaleString()} ${product.currency}</b>${orig}` +
        (discountPct > 0 ? ` <b>(-${discountPct}%)</b>` : '') +
        (vipPct > 0 ? ` · ${this.emojis.html('crown', '👑')} <i>VIP</i>` : '') +
        `\n${stockIcon} <b>${s.stockLabel}:</b> <b>${
          product.stock >= 9999
            ? lang === 'am'
              ? 'ያለገደብ ይገኛል'
              : 'Unlimited'
            : product.stock > 0
              ? `${product.stock} ${s.piecesUnit}`
              : s.outOfStock
        }</b>` +
        (product.stock <= 0 ? `\n${this.emojis.html('bell', '🔔')} <i>${s.outOfStockNote}</i>` : '') +
        (product.instantDelivery ? `\n${fireIcon} <b>${s.deliveryLabel}:</b> ${s.instantDeliveryText}` : '') +
        (hasWarranty ? `\n${shieldIcon} <b>${s.warrantyLabel}:</b> ${s.warrantyAvailable}` : '') +
        `\n${timeIcon} <i>${s.updatedLabel}:</i> <code>${timeStr}</code>`,
    );

    const text = parts.join('\n\n').slice(0, 3950);

    const keyboard: InlineButton[][] = [];

    if (product.stock > 0) {
      keyboard.push([
        { text: '−', callback_data: `pq:${product.id}:${Math.max(1, safeQty - 1)}` },
        { text: `${s.qtyLabel}: ${safeQty}`, callback_data: 'noop' },
        { text: '+', callback_data: `pq:${product.id}:${Math.min(50, safeQty + 1)}` },
      ]);
      keyboard.push([
        {
          text: `${s.buyNow} · ${total.toLocaleString()} ${product.currency}`,
          callback_data: `b:${product.id}:${safeQty}`,
          style: 'success',
          ...this.emojis.btnIcon('pay', product.emojiId),
        },
      ]);
      if ((tgUser?.storeCredit || 0) > 0 && total > 10) {
        const creditApply = Math.min(tgUser!.storeCredit, total - 1);
        keyboard.push([
          {
            text: s.useCreditBtn.replace('{amt}', creditApply.toLocaleString()),
            callback_data: `bc:${product.id}:${safeQty}`,
            style: 'primary',
            ...this.emojis.btnIcon('credit'),
          },
        ]);
      }
    } else {
      keyboard.push([
        notifyOn
          ? {
              text: s.notifyOn,
              callback_data: `al:${product.id}`,
              style: 'success',
              ...this.emojis.btnIcon('success'),
            }
          : {
              text: s.notifyMe,
              callback_data: `al:${product.id}`,
              style: 'primary',
              ...this.emojis.btnIcon('bell'),
            },
      ]);
    }

    const backCat = userState.lastCategorySlug || 'all';
    keyboard.push([
      { text: s.refreshBtn, callback_data: `pr:${product.id}:${safeQty}`, style: 'primary', ...this.emojis.btnIcon('pending') },
      { text: s.shareBtn, switch_inline_query: (loc.name || product.name).slice(0, 32), ...this.emojis.btnIcon('share') },
      { text: s.backBtn, callback_data: `c:${backCat}:0`, style: 'danger', ...this.emojis.btnIcon('back') },
    ]);

    await this.showOrEditText(chatId, text, { inline_keyboard: keyboard }, messageId, wasPhoto);
  }

  async refreshProduct(
    chatId: string | number,
    telegramId: string,
    lang: BotLang,
    productId: string,
    qty: number,
    callbackId: string,
    messageId: number,
    wasPhoto: boolean,
  ) {
    await this.supplier.refreshProductStock(productId);
    await this.telegram.answerCallbackQuery(callbackId, '🔄 Stock updated');
    await this.showProduct(chatId, telegramId, lang, productId, qty, messageId, wasPhoto, false);
  }

  async showProductDetails(chatId: string | number, lang: BotLang, productId: string) {
    let product: any;
    try {
      product = await this.products.findOne(productId);
    } catch {
      return;
    }
    const s = this.i18n.t(lang);
    const loc = this.i18n.localizeProduct(product, lang);
    const prodEmojiId = this.emojis.productEmojiId(product);
    const icon = prodEmojiId ? tgEmoji(prodEmojiId, '📋') : this.emojis.html('details', '📋');
    const { text: cleanDesc, hasWarranty } = this.cleanDescriptionAndWarranty(
      loc.description || loc.shortDesc,
      loc.name || product.name,
    );

    const reqs = loc.requirements.length
      ? `\n\n${this.emojis.html('guide', '📌')} <b>${s.requirementsLabel}:</b>\n${loc.requirements.map((r) => `• ${escapeHtml(r)}`).join('\n')}`
      : '';
    const steps = loc.activationSteps.length
      ? `\n\n${this.emojis.html('rocket', '🚀')} <b>${s.guideLabel}:</b>\n${loc.activationSteps
          .slice(0, 5)
          .map((st, idx) => `${idx + 1}. ${escapeHtml(st)}`)
          .join('\n')}`
      : '';
    const warrantyLine = hasWarranty
      ? `\n\n${this.emojis.html('shield', '🛡')} <b>${s.warrantyLabel}:</b> ${s.warrantyAvailable}`
      : '';

    const text =
      `${icon} <b>${escapeHtml(loc.name || product.name)}</b>\n\n` +
      `${escapeHtml(cleanDesc)}` +
      reqs +
      steps +
      warrantyLine;

    await this.telegram.sendMessage(chatId, text.slice(0, 4000), {
      inline_keyboard: [
        product.stock > 0
          ? [
              {
                text: `${s.buyNow} · ${Number(product.price).toLocaleString()} ETB`,
                callback_data: `b:${product.id}:1`,
                style: 'success',
                ...this.emojis.btnIcon('pay', product.emojiId),
              },
            ]
          : [
              {
                text: s.notifyMe,
                callback_data: `al:${product.id}`,
                style: 'primary',
                ...this.emojis.btnIcon('bell'),
              },
            ],
        [{ text: s.backBtn, callback_data: `p:${product.id}`, style: 'danger', ...this.emojis.btnIcon('back') }],
      ],
    });
  }

  async subscribeStockAlert(
    chatId: string | number,
    from: { id: number | string; first_name?: string; username?: string },
    productId: string,
    callbackId: string,
    lang: BotLang,
    messageId?: number,
    wasPhoto?: boolean,
  ) {
    try {
      const res = await this.stockAlerts.toggle({
        productId,
        telegramUserId: String(from.id),
        username: from.username,
        firstName: from.first_name,
      });
      if (res.subscribed) {
        void this.users.trackEvent({ telegramId: String(from.id), eventType: 'STOCK_ALERT', productId });
      }
      await this.telegram.answerCallbackQuery(
        callbackId,
        res.subscribed ? this.i18n.t(lang).notifyDone : 'Restock alert disabled',
        false,
      );
      if (messageId) {
        await this.showProduct(chatId, String(from.id), lang, productId, 1, messageId, wasPhoto, false);
      }
    } catch (err: any) {
      await this.telegram.answerCallbackQuery(callbackId, err?.message || 'Could not update alert', true);
    }
  }

  /** Buttons-only search results. */
  async runSearch(chatId: string | number, telegramId: string, lang: BotLang, query: string) {
    await this.emojis.warmUiPacks();
    await this.state.setState(telegramId, { inputStep: null });
    const q = query.trim();
    if (!q) return;

    void this.users.trackEvent({ telegramId, eventType: 'SEARCH', query: q });

    const results = await this.products.findAll(undefined, q);
    if (!results.length) {
      await this.telegram.sendMessage(
        chatId,
        `${this.emojis.html('search', '🔍')} ${this.i18n.t(lang).searchEmpty}`,
        {
          inline_keyboard: [
            [{ text: 'Try Another Search', callback_data: 'srch:go', style: 'primary', ...this.emojis.btnIcon('search') }],
            [{ text: 'Browse All Products', callback_data: 'c:all:0', ...this.emojis.btnIcon('shop') }],
          ],
        },
      );
      return;
    }

    const top = results.slice(0, 8);

    await this.telegram.sendMessage(
      chatId,
      `${this.emojis.html('search', '🔍')} <b>"${escapeHtml(q)}"</b> · ${results.length} found\n<i>Tap a product below 👇</i>`,
      {
        inline_keyboard: [
          ...top.map((p: any) => {
            const emojiId = this.emojis.productEmojiId(p);
            return [
              {
                text: `${this.i18n.localizeProduct(p, lang).name} · ${Number(p.price).toLocaleString()} ETB`.slice(0, 56),
                callback_data: `p:${p.id}`,
                style: (p.stock > 0 ? 'primary' : 'danger') as 'primary' | 'danger',
                ...(emojiId ? { icon_custom_emoji_id: emojiId } : {}),
              },
            ];
          }),
          [{ text: 'Home', callback_data: 'h:0', ...this.emojis.btnIcon('back') }],
        ],
      },
    );
  }

  /** Buttons-only My Orders list. */
  async showOrders(chatId: string | number, telegramId: string, lang: BotLang, page = 0, messageId?: number, wasPhoto?: boolean) {
    await this.emojis.warmUiPacks();
    const s = this.i18n.t(lang);
    const res = await this.orders.findMine({ telegramUserId: telegramId, page: page + 1, limit: 6 });

    if (!res.orders.length) {
      await this.showOrEditText(
        chatId,
        `${this.emojis.html('orders', '📦')} <b>${s.ordersTitle}</b>\n\n${s.noOrders}`,
        {
          inline_keyboard: [
            [{ text: 'Open Store', callback_data: 'c:all:0', style: 'primary', ...this.emojis.btnIcon('shop') }],
          ],
        },
        messageId,
        wasPhoto,
      );
      return;
    }

    const keyboard: InlineButton[][] = res.orders.map((o: any) => [
      {
        text: `${o.product?.name || 'Order'} · ${o.amount === 0 ? 'FREE' : `${Number(o.amount).toLocaleString()} ${o.currency}`}`.slice(0, 56),
        callback_data: `o:${o.id}`,
        style: o.status === 'PAID' ? 'success' : 'primary',
        ...this.emojis.btnIcon(o.status === 'PAID' ? 'key' : 'pending'),
      },
    ]);

    if (res.totalPages > 1) {
      const nav: InlineButton[] = [];
      if (page > 0) nav.push({ text: '‹', callback_data: `ord:${page - 1}` });
      nav.push({ text: `${page + 1}/${res.totalPages}`, callback_data: 'noop' });
      if (page + 1 < res.totalPages) nav.push({ text: '›', callback_data: `ord:${page + 1}` });
      keyboard.push(nav);
    }

    keyboard.push([{ text: 'Home', callback_data: 'h:0', ...this.emojis.btnIcon('back') }]);
    await this.showOrEditText(
      chatId,
      `${this.emojis.html('orders', '📦')} <b>${s.ordersTitle}</b> · ${res.total}\n<i>Tap an order to view key &amp; guide 👇</i>`,
      { inline_keyboard: keyboard },
      messageId,
      wasPhoto,
    );
  }

  async showOrderDetail(chatId: string | number, telegramId: string, lang: BotLang, orderId: string, messageId?: number, wasPhoto?: boolean) {
    let order: any;
    try {
      order = await this.orders.findOne(orderId);
    } catch {
      await this.telegram.sendMessage(chatId, '❌ Order not found.');
      return;
    }

    if (order.telegramUserId && String(order.telegramUserId) !== String(telegramId)) {
      await this.telegram.sendMessage(chatId, '❌ Order not found.');
      return;
    }

    const prodEmojiId = order.product ? this.emojis.productEmojiId(order.product) : null;
    const icon = prodEmojiId ? tgEmoji(prodEmojiId, '📦') : this.emojis.html('orders', '📦');
    const header =
      `${icon} <b>${escapeHtml(order.product?.name || 'Order')}</b>\n` +
      `${this.emojis.html('details', '🧾')} <code>${escapeHtml(order.txRef)}</code>\n` +
      `${this.emojis.html('money', '💰')} <b>${order.amount === 0 ? 'Reward (Free)' : `${Number(order.amount).toLocaleString()} ${order.currency}`}</b>\n` +
      `${this.emojis.html(order.status === 'PAID' ? 'success' : 'pending', '📌')} <b>${escapeHtml(order.status)}</b> (${escapeHtml(order.fulfillmentStatus || 'NONE')})\n\n`;

    if (order.status !== 'PAID') {
      const keyboard: InlineButton[][] = [];
      if (order.paymentMode === 'mock') {
        keyboard.push([
          { text: 'Complete Test Payment', callback_data: `pm:${order.id}`, style: 'success', ...this.emojis.btnIcon('pay') },
        ]);
      } else if (order.paymentUrl && /^https?:\/\//i.test(order.paymentUrl)) {
        keyboard.push([{ text: 'Pay Now (Birr)', url: order.paymentUrl, style: 'success', ...this.emojis.btnIcon('pay') }]);
        keyboard.push([
          {
            text: 'Check Payment Status',
            callback_data: `pv:${order.cartRef || order.txRef}`,
            style: 'primary',
            ...this.emojis.btnIcon('pending'),
          },
        ]);
      }
      keyboard.push([{ text: 'My Orders', callback_data: 'ord:0', ...this.emojis.btnIcon('back') }]);
      await this.showOrEditText(chatId, `${header}<i>Awaiting payment confirmation.</i>`, { inline_keyboard: keyboard }, messageId, wasPhoto);
      return;
    }

    if (!order.licenseKey) {
      await this.showOrEditText(
        chatId,
        `${header}<i>Your order is paid and currently being fulfilled. Check back in a few seconds!</i>`,
        {
          inline_keyboard: [
            [{ text: 'Refresh Delivery', callback_data: `o:${order.id}`, style: 'primary', ...this.emojis.btnIcon('pending') }],
            [{ text: 'My Orders', callback_data: 'ord:0', ...this.emojis.btnIcon('back') }],
          ],
        },
        messageId,
        wasPhoto,
      );
      return;
    }

    const formatted = formatDeliveryForTelegram(order.licenseKey);
    if (formatted.tooLong) {
      await this.telegram.sendDocument(
        chatId,
        `${order.txRef}.txt`,
        order.licenseKey,
        `${header}Your delivery is attached as a file above.`,
        {
          inline_keyboard: [
            [{ text: 'Activation Guide', callback_data: `og:${order.id}`, style: 'primary', ...this.emojis.btnIcon('guide') }],
            [{ text: 'My Orders', callback_data: 'ord:0', ...this.emojis.btnIcon('back') }],
          ],
        },
      );
      return;
    }

    const keyboard: InlineButton[][] = formatted.urls.map((u) => [
      { text: u.label, url: u.url, style: 'primary', ...this.emojis.btnIcon('share') },
    ]);
    if (order.product?.activationGuide) {
      keyboard.push([
        { text: 'Activation Guide', callback_data: `og:${order.id}`, style: 'success', ...this.emojis.btnIcon('guide') },
      ]);
    }
    keyboard.push([
      { text: 'My Orders', callback_data: 'ord:0', ...this.emojis.btnIcon('back') },
      { text: 'Store', callback_data: 'h:0', ...this.emojis.btnIcon('shop') },
    ]);

    await this.showOrEditText(chatId, `${header}${formatted.html}`, { inline_keyboard: keyboard }, messageId, wasPhoto);
  }

  async showActivationGuide(chatId: string | number, lang: BotLang, orderId: string, messageId?: number, wasPhoto?: boolean) {
    let order: any;
    try {
      order = await this.orders.findOne(orderId);
    } catch {
      return;
    }
    const guide = order.product?.activationGuide;
    if (!guide) {
      await this.telegram.sendMessage(chatId, 'No activation guide needed — just paste your key!');
      return;
    }

    const loc = this.i18n.localizeProduct(order.product, lang);
    const steps = (loc.activationSteps.length ? loc.activationSteps : guide.steps || []) as string[];
    const stepsText = steps.length
      ? steps.map((st, idx) => `<b>${idx + 1}.</b> ${escapeHtml(st)}`).join('\n\n')
      : '<i>Follow the notes below.</i>';

    const text =
      `${this.emojis.html('guide', '📖')} <b>Activation Guide — ${escapeHtml(loc.name)}</b>\n\n` +
      `${stepsText}` +
      (guide.notes ? `\n\n${this.emojis.html('details', '📝')} <b>Note:</b> ${escapeHtml(guide.notes)}` : '');

    const keyboard: InlineButton[][] = [];
    if (guide.downloadUrl) keyboard.push([{ text: 'Download Link', url: guide.downloadUrl, style: 'primary', ...this.emojis.btnIcon('share') }]);
    if (guide.videoUrl) keyboard.push([{ text: 'Video Tutorial', url: guide.videoUrl, style: 'primary', ...this.emojis.btnIcon('fire') }]);
    keyboard.push([{ text: 'Back to Order & Key', callback_data: `o:${order.id}`, style: 'success', ...this.emojis.btnIcon('back') }]);

    await this.showOrEditText(chatId, text.slice(0, 4000), { inline_keyboard: keyboard }, messageId, wasPhoto);
  }

  async verifyPaymentCallback(chatId: string | number, txRef: string, callbackId: string) {
    try {
      const res = await this.payments.verifyPayment(txRef);
      const paid = res?.orders?.every((o: any) => o.status === 'PAID');
      if (paid) {
        await this.telegram.answerCallbackQuery(callbackId, '✅ Payment confirmed!', true);
        if (res.orderId) {
          await this.showOrderDetail(chatId, res.telegramUserId || '', 'en', res.orderId);
        }
      } else {
        await this.telegram.answerCallbackQuery(callbackId, '⏳ Payment not confirmed yet. Finish payment first.', true);
      }
    } catch (err: any) {
      await this.telegram.answerCallbackQuery(callbackId, err?.message || 'Verification failed', true);
    }
  }

  async mockPayCallback(chatId: string | number, orderId: string, callbackId: string) {
    try {
      await this.payments.mockConfirmOrder(orderId);
      await this.telegram.answerCallbackQuery(callbackId, '✅ Test payment completed!', false);
    } catch (err: any) {
      await this.telegram.answerCallbackQuery(callbackId, err?.message || 'Test pay failed', true);
    }
  }

  /** Inline mode (@YourBot <query>): share & buy rich product cards in any chat! */
  async handleInlineQuery(inlineQuery: any) {
    await this.emojis.warmUiPacks();
    const query = String(inlineQuery?.query || '').trim();
    const fromId = String(inlineQuery?.from?.id || '');
    const [products, tgUser, botUsername] = await Promise.all([
      this.products.findAll(undefined, query || undefined),
      fromId ? this.prisma.tgUser.findUnique({ where: { telegramId: fromId } }) : null,
      this.telegram.getBotUsername(),
    ]);

    if (tgUser?.isBanned) {
      await this.telegram.answerInlineQuery(inlineQuery.id, [], 5);
      return;
    }

    const refCode = tgUser?.referralCode || fromId;
    const results = products.slice(0, 15).map((p: any) => {
      const stockLabel = p.stock > 0 ? `${p.stock} in stock` : 'Out of stock';
      const priceLabel = `${Number(p.price).toLocaleString()} ${p.currency || 'ETB'}`;
      const deepLink = botUsername
        ? `https://t.me/${botUsername}?start=r_${refCode}_p_${p.id}`
        : `https://t.me/`;
      const emojiId = this.emojis.productEmojiId(p);

      return {
        type: 'article',
        id: p.id,
        title: `${p.name} — ${priceLabel}`,
        description: `${stockLabel} · ${p.shortDesc || ''}`.slice(0, 120),
        ...(/^https?:\/\//i.test(p.bannerUrl || '') ? { thumbnail_url: p.bannerUrl } : {}),
        input_message_content: {
          message_text:
            `${emojiId ? tgEmoji(emojiId, '🔑') : this.emojis.html('key', '🔑')} <b>${escapeHtml(p.name)}</b>\n` +
            `${this.emojis.html('money', '💰')} <b>${priceLabel}</b> · ${p.stock > 0 ? '🟢 In Stock' : '🔴 Out of Stock'}\n\n` +
            `${escapeHtml(p.shortDesc || '')}\n\n` +
            `${this.emojis.html('fire', '⚡')} Pay instant in Birr right inside Telegram:`,
          parse_mode: 'HTML',
        },
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `Buy ${p.name} · ${priceLabel}`.slice(0, 56),
                url: deepLink,
                style: 'success',
                ...(emojiId ? { icon_custom_emoji_id: emojiId } : {}),
              },
            ],
          ],
        },
      };
    });

    await this.telegram.answerInlineQuery(inlineQuery.id, results, 20);
  }
}
