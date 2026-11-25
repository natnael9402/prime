import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { HomeCardsService } from '../home-cards/home-cards.service';
import { OrdersService } from '../orders/orders.service';
import { StockAlertsService } from '../stock-alerts/stock-alerts.service';
import { PaymentsService } from '../payments/payments.service';
import { UsersService } from '../users/users.service';
import {
  TelegramService,
  InlineButton,
  escapeHtml,
  tgEmoji,
} from '../telegram/telegram.service';
import { BotI18nService, BotLang } from './bot-i18n.service';
import { BotStateService } from './bot-state.service';
import { formatDeliveryForTelegram } from './bot-delivery.formatter';

const PAGE_SIZE = 6;

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
    private readonly telegram: TelegramService,
    private readonly i18n: BotI18nService,
    private readonly state: BotStateService,
  ) {}

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
    const greet =
      lang === 'am'
        ? `👋 ሰላም <b>${escapeHtml(firstName || 'ወዳጅ')}</b>!`
        : `👋 Welcome, <b>${escapeHtml(firstName || 'Friend')}</b>!`;
    await this.telegram.sendMessage(
      chatId,
      `${greet}\n🔑 <b>${s.welcomeTitle}</b>`,
      this.i18n.mainReplyKeyboard(lang),
    );
  }

  async showHome(chatId: string | number, telegramId: string, lang: BotLang, messageId?: number, wasPhoto?: boolean) {
    const s = this.i18n.t(lang);
    const [categories, cards, tgUser] = await Promise.all([
      this.products.getCategories(),
      this.homeCards.listPublic(),
      this.prisma.tgUser.findUnique({ where: { telegramId } }),
    ]);

    const heroCard = cards.find((c: any) => c.kind === 'hero') || cards[0];
    const promoLines = cards
      .slice(0, 2)
      .map((c: any) => `✨ <b>${escapeHtml(c.title)}</b>${c.subtitle ? `\n<i>${escapeHtml(c.subtitle)}</i>` : ''}`)
      .join('\n\n');

    const vipBadge =
      tgUser?.customDiscountPct && tgUser.customDiscountPct > 0
        ? `🌟 VIP Discount: <b>${tgUser.customDiscountPct}% OFF</b> on every product!\n`
        : '';
    const creditBadge =
      tgUser?.storeCredit && tgUser.storeCredit > 0
        ? `💰 Store Credit: <b>${tgUser.storeCredit.toLocaleString()} ETB</b>\n`
        : '';

    const text =
      `🔑 <b>${s.welcomeTitle}</b>\n` +
      `<i>${s.welcomeSub}</i>\n\n` +
      (promoLines ? `${promoLines}\n\n` : '') +
      vipBadge +
      creditBadge +
      `<b>${s.pickCategory}</b>`;

    const keyboard: InlineButton[][] = [
      [
        { text: s.allProducts, callback_data: 'c:all:0', style: 'primary' },
        { text: `⭐ ${s.featured}`, callback_data: 'c:featured:0' },
      ],
    ];

    const catButtons: InlineButton[] = (categories as any[])
      .filter((cat) => (cat._count?.products ?? 1) > 0)
      .map((cat) => ({
        text: cat.name,
        callback_data: `c:${cat.slug}:0`,
        ...(cat.emojiId ? { icon_custom_emoji_id: cat.emojiId } : {}),
      }));

    for (let i = 0; i < catButtons.length; i += 2) {
      keyboard.push(catButtons.slice(i, i + 2));
    }

    if (heroCard && heroCard.linkType === 'product' && heroCard.productId) {
      keyboard.push([
        {
          text: `${heroCard.title}`.slice(0, 48),
          callback_data: `p:${heroCard.productId}`,
          style: 'success',
        },
      ]);
    }

    keyboard.push([
      { text: '🎁 Invite & Unlock', callback_data: 'rew:home', style: 'success' },
      { text: `📦 ${lang === 'am' ? 'ትዕዛዞቼ' : 'Orders'}`, callback_data: 'ord:0' },
    ]);

    await this.showOrEditText(chatId, text, { inline_keyboard: keyboard }, messageId, wasPhoto);
  }

  async showCatalog(
    chatId: string | number,
    telegramId: string,
    lang: BotLang,
    categorySlug: string,
    page = 0,
    messageId?: number,
    wasPhoto?: boolean,
  ) {
    const s = this.i18n.t(lang);
    const [all, tgUser] = await Promise.all([
      this.products.findAll(categorySlug === 'featured' || categorySlug === 'all' ? undefined : categorySlug),
      this.prisma.tgUser.findUnique({ where: { telegramId } }),
    ]);

    void this.users.trackEvent({ telegramId, eventType: 'CATEGORY_VIEW', categorySlug });

    const filtered = categorySlug === 'featured' ? all.filter((p: any) => p.isFeatured) : all;
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const slice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
    const vipPct = Math.min(95, Math.max(0, Number(tgUser?.customDiscountPct || 0)));

    await this.state.setState(telegramId, { lastCategorySlug: categorySlug });

    if (slice.length === 0) {
      await this.showOrEditText(
        chatId,
        `📭 ${s.allProducts}: <i>No products in this category yet.</i>`,
        { inline_keyboard: [[{ text: '⬅️ Back to Store', callback_data: 'h:0', style: 'primary' }]] },
        messageId,
        wasPhoto,
      );
      return;
    }

    const lines = slice.map((p: any) => {
      const loc = this.i18n.localizeProduct(p, lang);
      const icon = tgEmoji(p.emojiId, '·');
      const finalPrice = vipPct > 0 ? Math.max(1, Math.round(p.price * (1 - vipPct / 100))) : p.price;
      const price = `${Number(finalPrice).toLocaleString()} ${p.currency || 'ETB'}`;
      const stockDot = p.stock > 0 ? '🟢' : '🔴';
      return `${icon} <b>${escapeHtml(loc.name)}</b> — <b>${price}</b> ${stockDot}`;
    });

    const title =
      categorySlug === 'all'
        ? `🛍 <b>${s.allProducts}</b>`
        : categorySlug === 'featured'
          ? `⭐ <b>${s.featured}</b>`
          : `📂 <b>${escapeHtml(categorySlug.toUpperCase())}</b>`;

    const text = `${title} · ${filtered.length}\n\n${lines.join('\n')}`;

    const keyboard: InlineButton[][] = slice.map((p: any) => {
      const loc = this.i18n.localizeProduct(p, lang);
      const finalPrice = vipPct > 0 ? Math.max(1, Math.round(p.price * (1 - vipPct / 100))) : p.price;
      const label = `${loc.name} · ${Number(finalPrice).toLocaleString()} ${p.currency || 'ETB'}`.slice(0, 56);
      return [
        {
          text: label,
          callback_data: `p:${p.id}`,
          style: p.stock > 0 ? 'primary' : 'danger',
          ...(p.emojiId ? { icon_custom_emoji_id: p.emojiId } : {}),
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
      { text: '← Home', callback_data: 'h:0' },
      { text: '🔍 Search', callback_data: 'srch:go' },
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

    const s = this.i18n.t(lang);
    const loc = this.i18n.localizeProduct(product, lang);
    const [userState, tgUser] = await Promise.all([
      this.state.getState(telegramId),
      this.prisma.tgUser.findUnique({ where: { telegramId } }),
    ]);

    const safeQty = Math.max(1, Math.min(product.stock > 0 ? Math.min(50, product.stock) : 1, qty));
    const vipPct = Math.min(95, Math.max(0, Number(tgUser?.customDiscountPct || 0)));
    const unitPrice =
      vipPct > 0 ? Math.max(1, Math.round(Number(product.price) * (1 - vipPct / 100))) : Number(product.price || 0);
    const total = unitPrice * safeQty;

    const icon = tgEmoji(product.emojiId, '🔑');
    const compareBase = vipPct > 0 ? product.price : product.originalPrice;
    const orig =
      compareBase && compareBase > unitPrice
        ? ` <s>${Number(compareBase).toLocaleString()} ${product.currency}</s>`
        : '';
    const discountPct =
      compareBase && compareBase > unitPrice ? Math.round((1 - unitPrice / compareBase) * 100) : 0;

    const featuresText = loc.features.slice(0, 3).map((f) => `· ${escapeHtml(f)}`).join('\n');
    const stockLine =
      product.stock > 0
        ? `🟢 <b>${s.instantDelivery}</b> · ${product.stock} left`
        : `🔴 <b>${s.outOfStock}</b>`;

    const caption =
      `${icon} <b>${escapeHtml(loc.name)}</b>` +
      (product.badge ? ` · <code>${escapeHtml(product.badge)}</code>` : '') +
      `\n` +
      `<b>${unitPrice.toLocaleString()} ${product.currency}</b>${orig}` +
      (discountPct > 0 ? ` <b>(-${discountPct}%)</b>` : '') +
      (vipPct > 0 ? ` · 🌟 <i>VIP</i>` : '') +
      `\n${stockLine}` +
      (loc.shortDesc ? `\n\n${escapeHtml(loc.shortDesc)}` : '') +
      (featuresText ? `\n\n${featuresText}` : '');

    const keyboard: InlineButton[][] = [];

    if (product.stock > 0) {
      keyboard.push([
        { text: '−', callback_data: `pq:${product.id}:${Math.max(1, safeQty - 1)}` },
        { text: `${safeQty}`, callback_data: 'noop' },
        { text: '+', callback_data: `pq:${product.id}:${Math.min(50, safeQty + 1)}` },
      ]);
      keyboard.push([
        {
          text: `${s.buyNow} · ${total.toLocaleString()} ${product.currency}`,
          callback_data: `b:${product.id}:${safeQty}`,
          style: 'success',
          ...(product.emojiId ? { icon_custom_emoji_id: product.emojiId } : {}),
        },
      ]);
      if ((tgUser?.storeCredit || 0) > 0 && total > 10) {
        const creditApply = Math.min(tgUser!.storeCredit, total - 1);
        keyboard.push([
          {
            text: `🎟 Use ${creditApply.toLocaleString()} ETB Credit`,
            callback_data: `bc:${product.id}:${safeQty}`,
            style: 'primary',
          },
        ]);
      }
    } else {
      keyboard.push([
        {
          text: `🔔 ${s.notifyMe}`,
          callback_data: `al:${product.id}`,
          style: 'primary',
        },
      ]);
    }

    const backCat = userState.lastCategorySlug || 'all';
    keyboard.push([
      { text: 'Details', callback_data: `pd:${product.id}` },
      { text: 'Share', switch_inline_query: loc.name.slice(0, 32) },
      { text: '← Back', callback_data: `c:${backCat}:0` },
    ]);

    const markup = { inline_keyboard: keyboard };
    const hasBanner = /^https?:\/\//i.test(product.bannerUrl || '');

    if (hasBanner) {
      if (messageId && wasPhoto) {
        const edited = await this.telegram.editMessageMedia(chatId, messageId, product.bannerUrl, caption, markup);
        if (edited) return;
      }
      if (messageId && !wasPhoto) {
        await this.telegram.deleteMessage(chatId, messageId);
      }
      const sent = await this.telegram.sendPhoto(chatId, product.bannerUrl, caption, markup);
      if (sent) return;
    }

    await this.showOrEditText(chatId, caption, markup, messageId, wasPhoto);
  }

  async showProductDetails(chatId: string | number, lang: BotLang, productId: string) {
    let product: any;
    try {
      product = await this.products.findOne(productId);
    } catch {
      return;
    }
    const loc = this.i18n.localizeProduct(product, lang);
    const icon = tgEmoji(product.emojiId, '📋');

    const reqs = loc.requirements.length
      ? `\n\n<b>Requirements:</b>\n${loc.requirements.map((r) => `• ${escapeHtml(r)}`).join('\n')}`
      : '';
    const steps = loc.activationSteps.length
      ? `\n\n<b>Activation Preview:</b>\n${loc.activationSteps
          .slice(0, 5)
          .map((st, idx) => `${idx + 1}. ${escapeHtml(st)}`)
          .join('\n')}`
      : '';

    const text =
      `${icon} <b>${escapeHtml(loc.name)} — Details</b>\n\n` +
      `${escapeHtml(loc.description || loc.shortDesc)}` +
      reqs +
      steps;

    await this.telegram.sendMessage(chatId, text.slice(0, 4000), {
      inline_keyboard: [
        product.stock > 0
          ? [{ text: `⚡ Buy Now — ${Number(product.price).toLocaleString()} ETB`, callback_data: `b:${product.id}:1`, style: 'success' }]
          : [{ text: '🔔 Notify Me When Back', callback_data: `al:${product.id}`, style: 'primary' }],
        [{ text: '⬅️ Back to Product', callback_data: `p:${product.id}` }],
      ],
    });
  }

  async subscribeStockAlert(
    chatId: string | number,
    from: { id: number | string; first_name?: string; username?: string },
    productId: string,
    callbackId: string,
    lang: BotLang,
  ) {
    try {
      await this.stockAlerts.subscribe({
        productId,
        telegramUserId: String(from.id),
        username: from.username,
        firstName: from.first_name,
      });
      void this.users.trackEvent({ telegramId: String(from.id), eventType: 'STOCK_ALERT', productId });
      await this.telegram.answerCallbackQuery(callbackId, this.i18n.t(lang).notifyDone, true);
    } catch (err: any) {
      await this.telegram.answerCallbackQuery(callbackId, err?.message || 'Could not subscribe', true);
    }
  }

  async runSearch(chatId: string | number, telegramId: string, lang: BotLang, query: string) {
    await this.state.setState(telegramId, { inputStep: null });
    const q = query.trim();
    if (!q) return;

    void this.users.trackEvent({ telegramId, eventType: 'SEARCH', query: q });

    const results = await this.products.findAll(undefined, q);
    if (!results.length) {
      await this.telegram.sendMessage(chatId, this.i18n.t(lang).searchEmpty, {
        inline_keyboard: [
          [{ text: '🔍 Try Another Search', callback_data: 'srch:go', style: 'primary' }],
          [{ text: '🛍 Browse All Products', callback_data: 'c:all:0' }],
        ],
      });
      return;
    }

    const top = results.slice(0, 8);
    const lines = top.map((p: any) => {
      const loc = this.i18n.localizeProduct(p, lang);
      return `${tgEmoji(p.emojiId, '📦')} <b>${escapeHtml(loc.name)}</b> — <b>${Number(p.price).toLocaleString()} ${p.currency}</b>`;
    });

    await this.telegram.sendMessage(
      chatId,
      `🔍 <b>Search results for "${escapeHtml(q)}"</b> (${results.length}):\n\n${lines.join('\n')}`,
      {
        inline_keyboard: [
          ...top.map((p: any) => [
            {
              text: `${this.i18n.localizeProduct(p, lang).name} — ${Number(p.price).toLocaleString()} ETB`.slice(0, 56),
              callback_data: `p:${p.id}`,
              style: (p.stock > 0 ? 'primary' : 'danger') as 'primary' | 'danger',
              ...(p.emojiId ? { icon_custom_emoji_id: p.emojiId } : {}),
            },
          ]),
          [{ text: '🏠 Home', callback_data: 'h:0' }],
        ],
      },
    );
  }

  async showOrders(chatId: string | number, telegramId: string, lang: BotLang, page = 0, messageId?: number, wasPhoto?: boolean) {
    const s = this.i18n.t(lang);
    const res = await this.orders.findMine({ telegramUserId: telegramId, page: page + 1, limit: 6 });

    if (!res.orders.length) {
      await this.showOrEditText(
        chatId,
        `📦 <b>${s.ordersTitle}</b>\n\n${s.noOrders}`,
        {
          inline_keyboard: [[{ text: '🛍 Open Store', callback_data: 'c:all:0', style: 'primary' }]],
        },
        messageId,
        wasPhoto,
      );
      return;
    }

    const lines = res.orders.map((o: any) => {
      const badge = o.status === 'PAID' ? '✅' : '⏳';
      const amt = o.amount === 0 ? 'FREE REWARD' : `${Number(o.amount).toLocaleString()} ${o.currency}`;
      return `${badge} <b>${escapeHtml(o.product?.name || 'Product')}</b> — <b>${amt}</b>\n   <code>${escapeHtml(o.txRef)}</code>`;
    });

    const keyboard: InlineButton[][] = res.orders.map((o: any) => [
      {
        text: `${o.status === 'PAID' ? '🔑' : '⏳'} ${o.product?.name || 'Order'} (${o.txRef.slice(-8)})`.slice(0, 56),
        callback_data: `o:${o.id}`,
        style: o.status === 'PAID' ? 'success' : 'primary',
      },
    ]);

    if (res.totalPages > 1) {
      const nav: InlineButton[] = [];
      if (page > 0) nav.push({ text: '◀️ Prev', callback_data: `ord:${page - 1}` });
      nav.push({ text: `${page + 1} / ${res.totalPages}`, callback_data: 'noop' });
      if (page + 1 < res.totalPages) nav.push({ text: 'Next ▶️', callback_data: `ord:${page + 1}` });
      keyboard.push(nav);
    }

    keyboard.push([{ text: '🏠 Home', callback_data: 'h:0' }]);
    await this.showOrEditText(
      chatId,
      `📦 <b>${s.ordersTitle}</b> (${res.total})\n\n${lines.join('\n\n')}`,
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

    const icon = tgEmoji(order.product?.emojiId, '📦');
    const header =
      `${icon} <b>${escapeHtml(order.product?.name || 'Order')}</b>\n` +
      `🧾 Ref: <code>${escapeHtml(order.txRef)}</code>\n` +
      `💰 Amount: <b>${order.amount === 0 ? 'Reward (Free)' : `${Number(order.amount).toLocaleString()} ${order.currency}`}</b>\n` +
      `📌 Status: <b>${escapeHtml(order.status)}</b> (${escapeHtml(order.fulfillmentStatus || 'NONE')})\n\n`;

    if (order.status !== 'PAID') {
      const keyboard: InlineButton[][] = [];
      if (order.paymentMode === 'mock') {
        keyboard.push([{ text: '🧪 Complete Test Payment', callback_data: `pm:${order.id}`, style: 'success' }]);
      } else if (order.paymentUrl && /^https?:\/\//i.test(order.paymentUrl)) {
        keyboard.push([{ text: '💳 Pay Now (Chapa)', url: order.paymentUrl, style: 'success' }]);
        keyboard.push([{ text: '🔄 Check Payment Status', callback_data: `pv:${order.cartRef || order.txRef}`, style: 'primary' }]);
      }
      keyboard.push([{ text: '⬅️ My Orders', callback_data: 'ord:0' }]);
      await this.showOrEditText(chatId, `${header}⏳ <i>Awaiting payment confirmation.</i>`, { inline_keyboard: keyboard }, messageId, wasPhoto);
      return;
    }

    if (!order.licenseKey) {
      await this.showOrEditText(
        chatId,
        `${header}⏳ <i>Your order is paid and currently being fulfilled. Check back in a few seconds!</i>`,
        {
          inline_keyboard: [
            [{ text: '🔄 Refresh Delivery', callback_data: `o:${order.id}`, style: 'primary' }],
            [{ text: '⬅️ My Orders', callback_data: 'ord:0' }],
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
        `${header}📄 Your delivery is attached as a file above.`,
        {
          inline_keyboard: [
            [{ text: '📖 Activation Guide', callback_data: `og:${order.id}`, style: 'primary' }],
            [{ text: '⬅️ My Orders', callback_data: 'ord:0' }],
          ],
        },
      );
      return;
    }

    const keyboard: InlineButton[][] = formatted.urls.map((u) => [{ text: u.label, url: u.url, style: 'primary' }]);
    if (order.product?.activationGuide) {
      keyboard.push([{ text: '📖 Activation Guide', callback_data: `og:${order.id}`, style: 'success' }]);
    }
    keyboard.push([
      { text: '⬅️ My Orders', callback_data: 'ord:0' },
      { text: '🛍 Store', callback_data: 'h:0' },
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
      await this.telegram.sendMessage(chatId, 'ℹ️ No activation guide needed — just paste your key!');
      return;
    }

    const loc = this.i18n.localizeProduct(order.product, lang);
    const steps = (loc.activationSteps.length ? loc.activationSteps : guide.steps || []) as string[];
    const stepsText = steps.length
      ? steps.map((st, idx) => `<b>${idx + 1}.</b> ${escapeHtml(st)}`).join('\n\n')
      : '<i>Follow the notes below.</i>';

    const text =
      `📖 <b>Activation Guide — ${escapeHtml(loc.name)}</b>\n\n` +
      `${stepsText}` +
      (guide.notes ? `\n\n📝 <b>Note:</b> ${escapeHtml(guide.notes)}` : '');

    const keyboard: InlineButton[][] = [];
    if (guide.downloadUrl) keyboard.push([{ text: '⬇️ Download Link', url: guide.downloadUrl, style: 'primary' }]);
    if (guide.videoUrl) keyboard.push([{ text: '🎬 Video Tutorial', url: guide.videoUrl, style: 'primary' }]);
    keyboard.push([{ text: '⬅️ Back to Order & Key', callback_data: `o:${order.id}`, style: 'success' }]);

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
        await this.telegram.answerCallbackQuery(callbackId, '⏳ Payment not confirmed yet. Finish Chapa checkout first.', true);
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

      return {
        type: 'article',
        id: p.id,
        title: `${p.name} — ${priceLabel}`,
        description: `${stockLabel} · ${p.shortDesc || ''}`.slice(0, 120),
        ...(/^https?:\/\//i.test(p.bannerUrl || '') ? { thumbnail_url: p.bannerUrl } : {}),
        input_message_content: {
          message_text:
            `${tgEmoji(p.emojiId, '🔑')} <b>${escapeHtml(p.name)}</b>\n` +
            `💰 <b>${priceLabel}</b> · ${p.stock > 0 ? '🟢 In Stock' : '🔴 Out of Stock'}\n\n` +
            `${escapeHtml(p.shortDesc || '')}\n\n` +
            `⚡ Pay instantly with Chapa inside Telegram:`,
          parse_mode: 'HTML',
        },
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `⚡ Buy ${p.name} — ${priceLabel}`.slice(0, 56),
                url: deepLink,
                style: 'success',
                ...(p.emojiId ? { icon_custom_emoji_id: p.emojiId } : {}),
              },
            ],
          ],
        },
      };
    });

    await this.telegram.answerInlineQuery(inlineQuery.id, results, 20);
  }
}
