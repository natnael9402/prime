import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TelegramService, escapeHtml } from '../telegram/telegram.service';
import { AffiliatesService } from '../affiliates/affiliates.service';
import { RewardsService } from '../rewards/rewards.service';
import { UsersService } from '../users/users.service';
import { BotI18nService } from './bot-i18n.service';
import { BotStateService } from './bot-state.service';
import { BotMenuService } from './bot-menu.service';
import { BotCheckoutService } from './bot-checkout.service';
import { BotRewardsService } from './bot-rewards.service';

@Injectable()
export class BotUpdateRouter implements OnModuleInit {
  private readonly logger = new Logger(BotUpdateRouter.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly affiliates: AffiliatesService,
    private readonly rewards: RewardsService,
    private readonly users: UsersService,
    private readonly i18n: BotI18nService,
    private readonly state: BotStateService,
    private readonly menu: BotMenuService,
    private readonly checkout: BotCheckoutService,
    private readonly botRewards: BotRewardsService,
  ) {}

  onModuleInit() {
    this.telegram.registerUpdateHandler((update) => this.handleUpdate(update));
    this.logger.log('Interactive Telegram Bot router registered.');
  }

  async handleUpdate(update: any) {
    if (update?.pre_checkout_query) {
      await this.checkout.handlePreCheckoutQuery(update.pre_checkout_query);
      return;
    }

    if (update?.inline_query) {
      await this.menu.handleInlineQuery(update.inline_query);
      return;
    }

    if (update?.callback_query) {
      await this.handleCallback(update.callback_query);
      return;
    }

    if (update?.message) {
      await this.handleMessage(update.message);
    }
  }

  private async handleMessage(msg: any) {
    if (!msg?.from) return;

    if (msg.successful_payment) {
      await this.checkout.handleSuccessfulPayment(msg);
      return;
    }

    const chatId = msg.chat.id;
    const telegramId = String(msg.from.id);
    const text = String(msg.text || '').trim();
    if (!text) return;

    let startParam = '';
    let inviterRef: string | null = null;
    let targetProductId: string | null = null;

    if (text.startsWith('/start')) {
      startParam = text.split(/\s+/)[1] || '';
      const refProd = startParam.match(/^(?:ref|r|inv)_([A-Za-z0-9_-]+?)_p_([A-Za-z0-9_-]+)$/);
      const refOnly = startParam.match(/^(?:ref|r|inv)_([A-Za-z0-9_-]+)$/);
      const prodOnly = startParam.match(/^p_([A-Za-z0-9_-]+)$/);

      if (refProd) {
        inviterRef = refProd[1];
        targetProductId = refProd[2];
      } else if (refOnly) {
        inviterRef = refOnly[1];
      } else if (prodOnly) {
        targetProductId = prodOnly[1];
      }
    }

    const { user } = await this.rewards.ensureTgUser(msg.from, inviterRef);
    const lang = this.i18n.normalizeLang(user.languageCode);

    if (user.isBanned) {
      await this.telegram.sendMessage(
        chatId,
        `🚫 <b>Your account has been suspended.</b>${user.banReason ? `\nReason: ${escapeHtml(user.banReason)}` : ''}`,
      );
      return;
    }

    if (inviterRef) {
      await this.state.setState(telegramId, { pendingRef: inviterRef });
      void this.affiliates.trackClick(inviterRef).catch(() => undefined);
    }

    if (this.rewards.requiredChannel && !user.inviteVerified && user.invitedById) {
      void this.rewards.verifyChannelJoin(telegramId);
    }

    if (text.startsWith('/start')) {
      void this.users.trackEvent({ telegramId, eventType: 'BOT_START', meta: { startParam: startParam || null } });
      await this.state.setState(telegramId, { inputStep: null });
      await this.menu.sendWelcomeDock(chatId, lang, msg.from.first_name);
      if (startParam.startsWith('order_')) {
        await this.menu.showOrders(chatId, telegramId, lang, 0);
        return;
      }
      if (targetProductId) {
        await this.menu.showProduct(chatId, telegramId, lang, targetProductId, 1);
        return;
      }
      await this.menu.showHome(chatId, telegramId, lang);
      return;
    }

    if (text === '/id') {
      await this.telegram.sendMessage(chatId, `🆔 Your chat id: <code>${chatId}</code>`);
      return;
    }

    if (text.startsWith('/shop')) {
      await this.state.setState(telegramId, { inputStep: null });
      await this.menu.showHome(chatId, telegramId, lang);
      return;
    }

    if (text.startsWith('/orders')) {
      await this.state.setState(telegramId, { inputStep: null });
      await this.menu.showOrders(chatId, telegramId, lang, 0);
      return;
    }

    if (text.startsWith('/invite')) {
      await this.state.setState(telegramId, { inputStep: null });
      await this.botRewards.showInviteHome(chatId, telegramId, lang);
      return;
    }

    if (text.startsWith('/affiliate')) {
      await this.state.setState(telegramId, { inputStep: null });
      await this.botRewards.showAffiliate(chatId, msg.from, lang);
      return;
    }

    if (text.startsWith('/search')) {
      await this.state.setState(telegramId, { inputStep: 'SEARCH' });
      await this.telegram.sendMessage(chatId, this.i18n.t(lang).searchPrompt);
      return;
    }

    if (text.startsWith('/lang')) {
      const nextLang = lang === 'am' ? 'en' : 'am';
      await this.rewards.setLanguage(telegramId, nextLang);
      await this.telegram.sendMessage(
        chatId,
        this.i18n.t(nextLang).langSwitched,
        this.i18n.mainReplyKeyboard(nextLang),
      );
      await this.menu.showHome(chatId, telegramId, nextLang);
      return;
    }

    if (text.startsWith('/help')) {
      await this.telegram.sendMessage(chatId, this.i18n.t(lang).helpText);
      return;
    }

    const dock = this.i18n.matchReplyButton(text);
    if (dock) {
      await this.state.setState(telegramId, { inputStep: null });
      switch (dock) {
        case 'SHOP':
          await this.menu.showHome(chatId, telegramId, lang);
          return;
        case 'ORDERS':
          await this.menu.showOrders(chatId, telegramId, lang, 0);
          return;
        case 'INVITE':
          await this.botRewards.showInviteHome(chatId, telegramId, lang);
          return;
        case 'SEARCH':
          await this.state.setState(telegramId, { inputStep: 'SEARCH' });
          await this.telegram.sendMessage(chatId, this.i18n.t(lang).searchPrompt);
          return;
        case 'LANG': {
          const nextLang = lang === 'am' ? 'en' : 'am';
          await this.rewards.setLanguage(telegramId, nextLang);
          await this.telegram.sendMessage(
            chatId,
            this.i18n.t(nextLang).langSwitched,
            this.i18n.mainReplyKeyboard(nextLang),
          );
          await this.menu.showHome(chatId, telegramId, nextLang);
          return;
        }
        case 'HELP':
          await this.telegram.sendMessage(chatId, this.i18n.t(lang).helpText);
          return;
      }
    }

    const st = await this.state.getState(telegramId);
    if (st.inputStep === 'AFF_PAYOUT_ACCOUNT') {
      await this.botRewards.handlePayoutAccountInput(chatId, msg.from, text, lang);
      return;
    }

    await this.menu.runSearch(chatId, telegramId, lang, text);
  }

  private async handleCallback(cb: any) {
    const data = String(cb?.data || '');
    const from = cb?.from;
    const msg = cb?.message;
    if (!from || !msg) return;

    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const wasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
    const telegramId = String(from.id);

    const { user } = await this.rewards.ensureTgUser(from, null);
    if (user.isBanned) {
      await this.telegram.answerCallbackQuery(cb.id, '🚫 Your account is suspended.', true);
      return;
    }
    const lang = this.i18n.normalizeLang(user.languageCode);

    if (data === 'noop') {
      await this.telegram.answerCallbackQuery(cb.id);
      return;
    }

    if (data.startsWith('h:')) {
      await this.telegram.answerCallbackQuery(cb.id);
      await this.menu.showHome(chatId, telegramId, lang, messageId, wasPhoto);
      return;
    }

    if (data.startsWith('c:')) {
      const [, slug, pageStr] = data.split(':');
      await this.telegram.answerCallbackQuery(cb.id);
      await this.menu.showCatalog(chatId, telegramId, lang, slug || 'all', Number(pageStr || 0), messageId, wasPhoto);
      return;
    }

    if (data.startsWith('p:')) {
      const productId = data.slice(2);
      await this.telegram.answerCallbackQuery(cb.id);
      await this.menu.showProduct(chatId, telegramId, lang, productId, 1, messageId, wasPhoto, true);
      return;
    }

    if (data.startsWith('pq:')) {
      const [, productId, qtyStr] = data.split(':');
      await this.telegram.answerCallbackQuery(cb.id);
      // Stepper changes qty without inflating PRODUCT_VIEW count
      await this.menu.showProduct(chatId, telegramId, lang, productId, Number(qtyStr || 1), messageId, wasPhoto, false);
      return;
    }

    if (data.startsWith('pd:')) {
      const productId = data.slice(3);
      await this.telegram.answerCallbackQuery(cb.id);
      await this.menu.showProductDetails(chatId, lang, productId);
      return;
    }

    if (data.startsWith('b:')) {
      const [, productId, qtyStr] = data.split(':');
      await this.telegram.answerCallbackQuery(cb.id);
      await this.checkout.buyNow({
        chatId,
        from,
        productId,
        quantity: Number(qtyStr || 1),
        lang,
        useCredit: false,
      });
      return;
    }

    if (data.startsWith('bc:')) {
      const [, productId, qtyStr] = data.split(':');
      await this.telegram.answerCallbackQuery(cb.id);
      await this.checkout.buyNow({
        chatId,
        from,
        productId,
        quantity: Number(qtyStr || 1),
        lang,
        useCredit: true,
      });
      return;
    }

    if (data.startsWith('al:')) {
      const productId = data.slice(3);
      await this.menu.subscribeStockAlert(chatId, from, productId, cb.id, lang);
      return;
    }

    if (data.startsWith('inv:cancel:')) {
      const ref = data.slice(11);
      await this.checkout.cancelPendingInvoice(ref, telegramId);
      await this.telegram.deleteMessage(chatId, messageId);
      await this.telegram.answerCallbackQuery(cb.id, 'Cancelled');
      return;
    }

    if (data === 'srch:go') {
      await this.state.setState(telegramId, { inputStep: 'SEARCH' });
      await this.telegram.answerCallbackQuery(cb.id);
      await this.telegram.sendMessage(chatId, this.i18n.t(lang).searchPrompt);
      return;
    }

    if (data.startsWith('ord:')) {
      const page = Number(data.slice(4) || 0);
      await this.telegram.answerCallbackQuery(cb.id);
      await this.menu.showOrders(chatId, telegramId, lang, page, messageId, wasPhoto);
      return;
    }
    if (data.startsWith('o:')) {
      await this.telegram.answerCallbackQuery(cb.id);
      await this.menu.showOrderDetail(chatId, telegramId, lang, data.slice(2), messageId, wasPhoto);
      return;
    }
    if (data.startsWith('og:')) {
      await this.telegram.answerCallbackQuery(cb.id);
      await this.menu.showActivationGuide(chatId, lang, data.slice(3), messageId, wasPhoto);
      return;
    }
    if (data.startsWith('pv:')) {
      await this.menu.verifyPaymentCallback(chatId, data.slice(3), cb.id);
      return;
    }
    if (data.startsWith('pm:')) {
      await this.menu.mockPayCallback(chatId, data.slice(3), cb.id);
      return;
    }

    if (data === 'rew:home') {
      await this.telegram.answerCallbackQuery(cb.id);
      if (wasPhoto) await this.telegram.deleteMessage(chatId, messageId);
      await this.botRewards.showInviteHome(chatId, telegramId, lang, wasPhoto ? undefined : messageId);
      return;
    }
    if (data === 'rew:verify') {
      const check = await this.rewards.verifyChannelJoin(telegramId);
      await this.telegram.answerCallbackQuery(
        cb.id,
        check.joined ? '✅ Verified!' : `Please join ${check.channel} first`,
        !check.joined,
      );
      await this.botRewards.showInviteHome(chatId, telegramId, lang, messageId);
      return;
    }
    if (data.startsWith('rw:')) {
      await this.botRewards.handleClaimTier(chatId, telegramId, data.slice(3), cb.id, lang);
      return;
    }

    if (data === 'aff:dash') {
      await this.telegram.answerCallbackQuery(cb.id);
      await this.botRewards.showAffiliate(chatId, from, lang, wasPhoto ? undefined : messageId);
      return;
    }
    if (data === 'aff:join') {
      await this.telegram.answerCallbackQuery(cb.id, '🚀 Affiliate activated!');
      await this.botRewards.joinAffiliate(chatId, from, lang, messageId);
      return;
    }
    if (data === 'aff:pay') {
      await this.telegram.answerCallbackQuery(cb.id);
      await this.botRewards.startPayoutWizard(chatId, messageId);
      return;
    }
    if (data === 'aff:m:telebirr' || data === 'aff:m:cbe') {
      const method = data.endsWith('cbe') ? 'cbe' : 'telebirr';
      await this.telegram.answerCallbackQuery(cb.id);
      await this.botRewards.pickPayoutMethod(chatId, telegramId, method);
      return;
    }
    if (data === 'aff:cancel_input') {
      await this.state.setState(telegramId, { inputStep: null, payoutMethod: null });
      await this.telegram.answerCallbackQuery(cb.id, 'Cancelled');
      await this.botRewards.showAffiliate(chatId, from, lang, messageId);
      return;
    }

    await this.telegram.answerCallbackQuery(cb.id);
  }
}
