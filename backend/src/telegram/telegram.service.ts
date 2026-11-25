import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type BotButtonStyle = 'primary' | 'success' | 'danger';

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
  switch_inline_query?: string;
  switch_inline_query_current_chat?: string;
  pay?: boolean;
  style?: BotButtonStyle;
  icon_custom_emoji_id?: string;
}

export interface ReplyButton {
  text: string;
  style?: BotButtonStyle;
  icon_custom_emoji_id?: string;
}

export type UpdateHandler = (update: any) => Promise<void>;

const ALLOWED_UPDATES = ['message', 'callback_query', 'pre_checkout_query', 'inline_query'];

/** Escape text for Telegram HTML parse_mode. */
export function escapeHtml(text: string | null | undefined): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Render a Telegram custom emoji in HTML mode with a clean standard fallback. */
export function tgEmoji(emojiId: string | null | undefined, fallback = '🔹'): string {
  const clean = String(emojiId || '').trim();
  if (/^\d{10,25}$/.test(clean)) {
    return `<tg-emoji emoji-id="${clean}">${fallback}</tg-emoji>`;
  }
  return fallback;
}

/** Strip Bot API 9.4+ styling/custom emojis for graceful fallback on older clients/non-premium bots. */
function stripRichFields(payload: any): any {
  const clone = JSON.parse(JSON.stringify(payload));
  const cleanText = (s: string) =>
    typeof s === 'string' ? s.replace(/<tg-emoji[^>]*>(.*?)<\/tg-emoji>/g, '$1') : s;
  if (clone.text) clone.text = cleanText(clone.text);
  if (clone.caption) clone.caption = cleanText(clone.caption);
  if (clone.media?.caption) clone.media.caption = cleanText(clone.media.caption);
  const cleanButtons = (rows: any[][]) =>
    rows.map((row) =>
      row.map((btn) => {
        const next = { ...btn };
        delete next.icon_custom_emoji_id;
        delete next.style;
        return next;
      }),
    );
  if (clone.reply_markup?.inline_keyboard) {
    clone.reply_markup.inline_keyboard = cleanButtons(clone.reply_markup.inline_keyboard);
  }
  if (clone.reply_markup?.keyboard) {
    clone.reply_markup.keyboard = cleanButtons(clone.reply_markup.keyboard);
  }
  return clone;
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private token: string | undefined;
  private offset = 0;
  private polling = false;
  private pollTimer: any = null;
  private cachedBotUsername: string | null = null;
  private updateHandler: UpdateHandler | null = null;

  constructor(private config: ConfigService) {
    this.token = (this.config.get<string>('TELEGRAM_BOT_TOKEN') || '').trim();
  }

  private get adminChatId(): string | undefined {
    return this.config.get<string>('TELEGRAM_ADMIN_CHAT_ID') || undefined;
  }

  get enabled(): boolean {
    return !!this.token && !this.token.startsWith('mock') && this.token.length > 20;
  }

  registerUpdateHandler(handler: UpdateHandler) {
    this.updateHandler = handler;
  }

  async getBotUsername(): Promise<string | null> {
    const fromEnv = (this.config.get<string>('TELEGRAM_BOT_USERNAME') || '').replace(/^@/, '').trim();
    if (fromEnv) return fromEnv;
    if (this.cachedBotUsername) return this.cachedBotUsername;
    if (!this.enabled) return null;
    try {
      const res = await this.api('getMe', {});
      const username = res.data?.result?.username;
      if (username) this.cachedBotUsername = username;
      return username || null;
    } catch {
      return null;
    }
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('Telegram bot disabled (no valid TELEGRAM_BOT_TOKEN). Notifications skipped.');
      return;
    }
    // PM2 runs the bot in ONE dedicated process (kv-bot). API replicas set
    // TELEGRAM_ENABLE_BOT=false so polling/webhooks never run multi-instance.
    if ((this.config.get<string>('TELEGRAM_ENABLE_BOT') || 'true') === 'false') {
      this.logger.log('Telegram bot polling disabled on this process (API replica).');
      return;
    }

    void this.syncBotCommands();

    const webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL');
    if (webhookUrl) {
      await this.registerWebhook(webhookUrl);
    } else {
      this.startPolling();
    }
  }

  onModuleDestroy() {
    this.polling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  private async syncBotCommands() {
    try {
      await this.api('setMyCommands', {
        commands: [
          { command: 'start', description: 'Open Store' },
          { command: 'shop', description: 'Browse Products' },
          { command: 'orders', description: 'My Orders & Keys' },
          { command: 'invite', description: 'Invite & Unlock Rewards' },
          { command: 'affiliate', description: 'Affiliate Cash (10%)' },
          { command: 'search', description: 'Search Products' },
          { command: 'lang', description: 'Language (EN / አማ)' },
          { command: 'help', description: 'Support' },
        ],
      });
    } catch (err: any) {
      this.logger.warn(`setMyCommands failed: ${err?.message}`);
    }
  }

  api(method: string, payload: any) {
    return axios.post(`https://api.telegram.org/bot${this.token}/${method}`, payload, {
      timeout: 35000,
    });
  }

  private async apiWithStyleFallback(method: string, payload: any) {
    try {
      const res = await this.api(method, payload);
      return res.data;
    } catch (err: any) {
      const desc = String(err?.response?.data?.description || err?.message || '');
      const hasRich =
        desc.includes('STYLE') ||
        desc.includes('CUSTOM_EMOJI') ||
        desc.includes('emoji') ||
        desc.includes('tg-emoji') ||
        desc.includes('inline keyboard button');
      if (hasRich) {
        try {
          const res = await this.api(method, stripRichFields(payload));
          return res.data;
        } catch (retryErr: any) {
          this.logger.warn(`${method} fallback failed: ${retryErr?.response?.data?.description || retryErr.message}`);
          return null;
        }
      }
      if (!desc.includes('message is not modified')) {
        this.logger.warn(`${method} failed: ${desc}`);
      }
      return null;
    }
  }

  async sendMessage(chatId: string | number, text: string, replyMarkup?: any, extra?: Record<string, any>) {
    if (!this.enabled) return null;
    return this.apiWithStyleFallback('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      ...(extra || {}),
    });
  }

  async sendPhoto(chatId: string | number, photo: string, caption: string, replyMarkup?: any) {
    if (!this.enabled) return null;
    return this.apiWithStyleFallback('sendPhoto', {
      chat_id: chatId,
      photo,
      caption: caption.slice(0, 1024),
      parse_mode: 'HTML',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  async sendDocument(
    chatId: string | number,
    filename: string,
    content: string | Buffer,
    caption?: string,
    replyMarkup?: any,
  ) {
    if (!this.enabled) return null;
    try {
      const form = new FormData();
      form.append('chat_id', String(chatId));
      const blob = new Blob([typeof content === 'string' ? content : new Uint8Array(content)], {
        type: 'text/plain;charset=utf-8',
      });
      form.append('document', blob, filename);
      if (caption) {
        form.append('caption', caption.slice(0, 1024));
        form.append('parse_mode', 'HTML');
      }
      if (replyMarkup) {
        form.append('reply_markup', JSON.stringify(replyMarkup));
      }
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendDocument`, {
        method: 'POST',
        body: form,
      });
      return await res.json();
    } catch (err: any) {
      this.logger.warn(`sendDocument failed: ${err?.message}`);
      return null;
    }
  }

  async editMessageText(chatId: string | number, messageId: number, text: string, replyMarkup?: any) {
    if (!this.enabled) return null;
    return this.apiWithStyleFallback('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  async editMessageCaption(chatId: string | number, messageId: number, caption: string, replyMarkup?: any) {
    if (!this.enabled) return null;
    return this.apiWithStyleFallback('editMessageCaption', {
      chat_id: chatId,
      message_id: messageId,
      caption: caption.slice(0, 1024),
      parse_mode: 'HTML',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  async editMessageMedia(
    chatId: string | number,
    messageId: number,
    photoUrl: string,
    caption: string,
    replyMarkup?: any,
  ) {
    if (!this.enabled) return null;
    return this.apiWithStyleFallback('editMessageMedia', {
      chat_id: chatId,
      message_id: messageId,
      media: {
        type: 'photo',
        media: photoUrl,
        caption: caption.slice(0, 1024),
        parse_mode: 'HTML',
      },
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  async editMessageReplyMarkup(chatId: string | number, messageId: number, replyMarkup?: any) {
    if (!this.enabled) return null;
    return this.apiWithStyleFallback('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  async deleteMessage(chatId: string | number, messageId: number) {
    if (!this.enabled) return null;
    try {
      await this.api('deleteMessage', { chat_id: chatId, message_id: messageId });
    } catch {}
    return null;
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
    if (!this.enabled) return null;
    try {
      await this.api('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        ...(text ? { text: text.slice(0, 200) } : {}),
        show_alert: showAlert,
      });
    } catch {}
    return null;
  }

  async sendInvoice(payload: {
    chat_id: string | number;
    title: string;
    description: string;
    payload: string;
    provider_token: string;
    currency: string;
    prices: { label: string; amount: number }[];
    photo_url?: string;
    photo_width?: number;
    photo_height?: number;
    need_name?: boolean;
    need_phone_number?: boolean;
    need_email?: boolean;
    reply_markup?: any;
  }) {
    if (!this.enabled) return null;
    const res = await this.apiWithStyleFallback('sendInvoice', payload);
    if (res?.ok) return res;
    // Retry cleanly without photo_url if Telegram rejects the product image URL
    if (payload.photo_url) {
      const { photo_url, photo_width, photo_height, ...withoutPhoto } = payload;
      return this.apiWithStyleFallback('sendInvoice', withoutPhoto);
    }
    return res;
  }

  async answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string) {
    if (!this.enabled) return null;
    try {
      const res = await this.api('answerPreCheckoutQuery', {
        pre_checkout_query_id: preCheckoutQueryId,
        ok,
        ...(ok ? {} : { error_message: (errorMessage || 'Order could not be completed').slice(0, 255) }),
      });
      return res.data;
    } catch (err: any) {
      this.logger.warn(`answerPreCheckoutQuery failed: ${err?.response?.data?.description || err.message}`);
      return null;
    }
  }

  async answerInlineQuery(inlineQueryId: string, results: any[], cacheTime = 30) {
    if (!this.enabled) return null;
    try {
      const res = await this.api('answerInlineQuery', {
        inline_query_id: inlineQueryId,
        results,
        cache_time: cacheTime,
        is_personal: true,
      });
      return res.data;
    } catch (err: any) {
      this.logger.warn(`answerInlineQuery failed: ${err?.response?.data?.description || err.message}`);
      return null;
    }
  }

  async getStickerSet(name: string) {
    if (!this.enabled) return null;
    const clean = name
      .replace(/^https?:\/\/t\.me\/(addemoji|addstickers)\//i, '')
      .replace(/[^A-Za-z0-9_]/g, '')
      .trim();
    if (!clean) return null;
    const res = await this.api('getStickerSet', { name: clean });
    return res.data?.result || null;
  }

  async getFileBuffer(fileId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!this.enabled || !fileId) return null;
    try {
      const res = await this.api('getFile', { file_id: fileId });
      const filePath = res.data?.result?.file_path;
      if (!filePath) return null;
      const dl = await axios.get(`https://api.telegram.org/file/bot${this.token}/${filePath}`, {
        responseType: 'arraybuffer',
        timeout: 15000,
      });
      const ext = filePath.split('.').pop()?.toLowerCase();
      const contentType =
        ext === 'png'
          ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'webm'
              ? 'video/webm'
              : ext === 'tgs'
                ? 'application/x-tgsticker'
                : 'image/webp';
      return { buffer: Buffer.from(dl.data), contentType };
    } catch {
      return null;
    }
  }

  async getChatMember(chatId: string | number, userId: string | number): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const res = await this.api('getChatMember', { chat_id: chatId, user_id: Number(userId) });
      return res.data?.result?.status || null;
    } catch {
      return null;
    }
  }

  /** DM the store owner (no-op when TELEGRAM_ADMIN_CHAT_ID is unset). */
  async notifyAdmin(text: string, replyMarkup?: any) {
    const admin = this.adminChatId;
    if (!admin || !this.enabled) return null;
    return this.sendMessage(admin, text, replyMarkup);
  }

  async handleUpdate(update: any) {
    if (this.updateHandler) {
      await this.updateHandler(update);
      return;
    }
    this.logger.warn('Received Telegram update before BotModule registered update handler.');
  }

  private async startPolling() {
    this.polling = true;
    this.logger.log('Telegram bot polling started (getUpdates).');
    const loop = async () => {
      if (!this.polling) return;
      try {
        const res = await axios.get(`https://api.telegram.org/bot${this.token}/getUpdates`, {
          params: {
            offset: this.offset,
            timeout: 30,
            allowed_updates: JSON.stringify(ALLOWED_UPDATES),
          },
          timeout: 35000,
        });
        const updates = res.data?.result || [];
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handleUpdate(u).catch((err) =>
            this.logger.warn(`handleUpdate error: ${err?.message || err}`),
          );
        }
      } catch (err: any) {
        this.logger.warn(`Polling error: ${err?.message || err}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (this.polling) this.pollTimer = setTimeout(loop, 500);
    };
    loop();
  }

  private async registerWebhook(url: string) {
    try {
      await this.api('setWebhook', {
        url: `${url.replace(/\/$/, '')}/telegram/webhook`,
        allowed_updates: ALLOWED_UPDATES,
      });
      this.logger.log(`Telegram webhook set: ${url}/telegram/webhook`);
    } catch (err: any) {
      this.logger.error(`setWebhook failed: ${err?.message || err}`);
      this.startPolling();
    }
  }

  /** Notify buyer + optional owner alert when an order becomes PAID. */
  async notifyOrderPaid(order: {
    txRef: string;
    customerName: string;
    amount: number;
    currency: string;
    licenseKey?: string | null;
    telegramUserId?: string | null;
    id: string;
    product?: { name: string; emojiId?: string | null } | null;
  }) {
    if (!this.enabled) return;

    if (order.telegramUserId) {
      const icon = tgEmoji(order.product?.emojiId, '🔑');
      const keyPreview = (order.licenseKey || '').trim();
      const isLong = keyPreview.length > 1800;
      const body =
        `✅ <b>Order Delivered</b>\n\n` +
        `${icon} <b>${escapeHtml(order.product?.name || 'Product')}</b> · <b>${order.amount.toLocaleString()} ${escapeHtml(order.currency)}</b>\n` +
        `<code>${escapeHtml(order.txRef)}</code>\n\n` +
        (isLong
          ? `Tap below to view your full credentials &amp; activation guide.`
          : `<pre>${escapeHtml(keyPreview || 'Preparing…')}</pre>`);

      await this.sendMessage(order.telegramUserId, body, {
        inline_keyboard: [
          [
            {
              text: '📖 Activation Guide',
              callback_data: `o:${order.id}`,
              style: 'primary',
            } as InlineButton,
            {
              text: '🛍 Store',
              callback_data: 'h:0',
            } as InlineButton,
          ],
        ],
      });
    }

    const adminChat = this.adminChatId;
    if (adminChat) {
      await this.sendMessage(
        adminChat,
        `💵 <b>New Sale!</b>\n` +
          `👤 ${escapeHtml(order.customerName)}\n` +
          `📦 ${escapeHtml(order.product?.name || '-')}\n` +
          `💰 ${order.amount.toLocaleString()} ${escapeHtml(order.currency)}\n` +
          `🧾 <code>${escapeHtml(order.txRef)}</code>`,
      );
    }
  }

  /** Notify a subscriber that a product is back in stock (pure bot inline button). */
  async notifyBackInStock(data: {
    telegramUserId: string;
    productId?: string;
    productName: string;
    emojiId?: string | null;
    price: number;
    currency: string;
    productPath?: string;
  }) {
    if (!this.enabled) return null;
    const pid = data.productId || (data.productPath || '').split('/').pop() || '';
    const icon = tgEmoji(data.emojiId, '📦');
    return this.sendMessage(
      data.telegramUserId,
      `🔔 <b>የጠየቁት ምርት ተመልሷል! / Back in Stock!</b>\n\n` +
        `${icon} <b>${escapeHtml(data.productName)}</b>\n` +
        `💰 <b>${data.price.toLocaleString()} ${escapeHtml(data.currency)}</b>\n\n` +
        `ስቶክ ሳያልቅ አሁኑኑ ይግዙ 👇`,
      {
        inline_keyboard: [
          [
            {
              text: `⚡ Buy Now — ${data.price.toLocaleString()} ${data.currency}`,
              callback_data: pid ? `p:${pid}` : 'h:0',
              style: 'success',
              ...(data.emojiId ? { icon_custom_emoji_id: data.emojiId } : {}),
            } as InlineButton,
          ],
        ],
      },
    );
  }

  /** Notify an affiliate about a new commission (pure bot inline button). */
  async notifyAffiliateCommission(data: {
    telegramUserId?: string | null;
    productName?: string;
    amount: number;
    currency: string;
  }) {
    if (!this.enabled || !data.telegramUserId) return;
    await this.sendMessage(
      data.telegramUserId,
      `🎉 <b>አዲስ ኮሚሽን! / New Commission!</b>\n\n` +
        `📦 ${escapeHtml(data.productName || 'Product')} sold\n` +
        `💰 Commission: <b>${data.amount.toLocaleString()} ${escapeHtml(data.currency)}</b>\n\n` +
        `Track your balance & withdraw anytime below.`,
      {
        inline_keyboard: [
          [
            {
              text: '🤝 Open Affiliate Dashboard',
              callback_data: 'aff:dash',
              style: 'primary',
            } as InlineButton,
          ],
        ],
      },
    );
  }
}
