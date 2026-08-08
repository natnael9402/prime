import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private token: string | undefined;
  private offset = 0;
  private polling = false;
  private pollTimer: any = null;

  constructor(private config: ConfigService) {
    this.token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
  }

  get enabled(): boolean {
    return !!this.token && !this.token.startsWith('mock') && this.token.length > 20;
  }

  private get webAppUrl(): string {
    return (
      this.config.get<string>('TELEGRAM_WEBAPP_URL') ||
      this.config.get<string>('FRONTEND_URL') ||
      'http://localhost:3000'
    );
  }

  onModuleInit() {
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
    const webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL');
    if (webhookUrl) {
      this.registerWebhook(webhookUrl);
    } else {
      this.startPolling();
    }
  }

  onModuleDestroy() {
    this.polling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  private api(method: string, payload: any) {
    return axios.post(`https://api.telegram.org/bot${this.token}/${method}`, payload, {
      timeout: 35000,
    });
  }

  async sendMessage(chatId: string | number, text: string, replyMarkup?: any) {
    if (!this.enabled) return null;
    try {
      const res = await this.api('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      return res.data;
    } catch (err: any) {
      this.logger.warn(`sendMessage failed: ${err?.response?.data?.description || err.message}`);
      return null;
    }
  }

  private webAppButton(label: string, path = '') {
    return {
      inline_keyboard: [
        [{ text: label, web_app: { url: `${this.webAppUrl}${path}` } }],
      ],
    };
  }

  async handleUpdate(update: any) {
    const msg = update?.message;
    if (!msg?.text) return;
    const chatId = msg.chat.id;
    const text: string = msg.text;

    if (text.startsWith('/start')) {
      const name = msg.from?.first_name || 'ወዳጅ';

      // Referral deep link: /start ref_<CODE> or /start ref_<CODE>_p_<productId>
      const startParam = text.split(/\s+/)[1] || '';
      const refMatch = startParam.match(/^ref_([A-Za-z0-9]+?)(?:_p_([A-Za-z0-9_-]+))?$/);
      if (refMatch) {
        const [, code, productId] = refMatch;
        const path = productId ? `/product/${productId}?ref=${code}` : `/?ref=${code}`;
        await this.sendMessage(
          chatId,
          `👋 ሰላም <b>${name}</b>!\n\n` +
            `🎁 ጓደኛዎ ጋብዞትዎታል!\n` +
            `🔑 ፕሪሚየም ዲጂታል ላይሰንሶችን በሰከንዶች ይቀበሉ።\n\n` +
            `ሱቁን ክፈተው ግዢዎን ይጀምሩ 👇`,
          {
            inline_keyboard: [
              [{ text: '🛍 ሱቁን ክፈት', web_app: { url: `${this.webAppUrl}${path}` } }],
            ],
          },
        );
        return;
      }

      await this.sendMessage(
        chatId,
        `👋 ሰላም <b>${name}</b>!\n\n` +
          `🔑 <b>ቁልፍ ቫልት</b> — ፕሪሚየም ዲጂታል ላይሰንሶች በሰከንዶች።\n\n` +
          `🛍 ሱቁን ይክፈቱ እና ወዲያውኑ ቁልፍዎን ይቀበሉ።\n` +
          `🤝 አጋር ሆነው በእያንዳንዱ ሽያጭ ኮሚሽን ይገብሩ።`,
        {
          inline_keyboard: [
            [{ text: '🛍 ሱቁን ክፈት', web_app: { url: this.webAppUrl } }],
            [{ text: '📦 ትዕዛዞቼ', web_app: { url: `${this.webAppUrl}/orders` } }],
            [{ text: '🤝 አጋር ሁን', web_app: { url: `${this.webAppUrl}/affiliate` } }],
          ],
        },
      );
      return;
    }

    if (text.startsWith('/orders')) {
      await this.sendMessage(chatId, '📦 ትዕዛዞችዎን እዚህ ይመልከቱ:', this.webAppButton('📦 ትዕዛዞቼ', '/orders'));
      return;
    }

    if (text.startsWith('/affiliate')) {
      await this.sendMessage(
        chatId,
        '🤝 አጋር ይሁኑ — ሊንክዎን ያጋሩ እና በእያንዳንዱ ሽያጭ ኮሚሽን ያግኙ።',
        this.webAppButton('🤝 አጋር ሁን', '/affiliate'),
      );
      return;
    }

    if (text.startsWith('/help')) {
      await this.sendMessage(
        chatId,
        '📌 ትዕዛዞች:\n/start - ሱቁን ክፈት\n/orders - ትዕዛዞቼ\n/affiliate - አጋር ፕሮግራም\n/help - እርዳታ',
      );
      return;
    }
  }

  private async startPolling() {
    this.polling = true;
    this.logger.log('Telegram bot polling started (getUpdates).');
    const loop = async () => {
      if (!this.polling) return;
      try {
        const res = await axios.get(
          `https://api.telegram.org/bot${this.token}/getUpdates`,
          { params: { offset: this.offset, timeout: 30 }, timeout: 35000 },
        );
        const updates = res.data?.result || [];
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handleUpdate(u).catch(() => undefined);
        }
      } catch (err: any) {
        this.logger.warn(`Polling error: ${err?.message || err}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (this.polling) this.pollTimer = setTimeout(loop, 1000);
    };
    loop();
  }

  private async registerWebhook(url: string) {
    try {
      await this.api('setWebhook', { url: `${url}/telegram/webhook` });
      this.logger.log(`Telegram webhook set: ${url}/telegram/webhook`);
    } catch (err: any) {
      this.logger.error(`setWebhook failed: ${err?.message || err}`);
      this.startPolling();
    }
  }

  /** Notify buyer + admin when an order becomes PAID. */
  async notifyOrderPaid(order: {
    txRef: string;
    customerName: string;
    amount: number;
    currency: string;
    licenseKey?: string | null;
    telegramUserId?: string | null;
    id: string;
    product?: { name: string } | null;
  }) {
    if (!this.enabled) return;

    if (order.telegramUserId) {
      await this.sendMessage(
        order.telegramUserId,
        `✅ <b>ክፍያዎ ተረጋግጧል!</b>\n\n` +
          `📦 ${order.product?.name || 'ምርት'}\n` +
          `💰 ${order.amount} ${order.currency}\n\n` +
          `🔑 ቁልፍዎ:\n<code>${order.licenseKey || 'በመዘጋጀት ላይ'}</code>\n\n` +
          `የአክቲቬሽን መመሪያ ለማየት ከታች ይጫኑ።`,
        this.webAppButton('🔑 ቁልፍ ይመልከቱ', `/order/${order.id}/activation?tx_ref=${order.txRef}`),
      );
    }

    const adminChat = this.config.get<string>('TELEGRAM_ADMIN_CHAT_ID');
    if (adminChat) {
      await this.sendMessage(
        adminChat,
        `💵 <b>አዲስ ሽያጭ!</b>\n` +
          `👤 ${order.customerName}\n` +
          `📦 ${order.product?.name || '-'}\n` +
          `💰 ${order.amount} ${order.currency}\n` +
          `🧾 <code>${order.txRef}</code>`,
      );
    }
  }

  /** Notify a subscriber that a product is back in stock. */
  async notifyBackInStock(data: {
    telegramUserId: string;
    productName: string;
    price: number;
    currency: string;
    productPath: string;
  }) {
    if (!this.enabled) return null;
    return this.sendMessage(
      data.telegramUserId,
      `🔔 <b>የጠየቅኩት ምርት ተመልሷል!</b>\n\n` +
        `📦 ${data.productName}\n` +
        `💰 ${data.price.toLocaleString()} ${data.currency}\n\n` +
        `ስቶክ ሳያልቅ አሁኑኑ ይግዙ 👇`,
      this.webAppButton('🛒 አሁን ይግዙ', data.productPath),
    );
  }

  /** Notify an affiliate about a new commission. */
  async notifyAffiliateCommission(data: {
    telegramUserId?: string | null;
    productName?: string;
    amount: number;
    currency: string;
  }) {
    if (!this.enabled || !data.telegramUserId) return;
    await this.sendMessage(
      data.telegramUserId,
      `🎉 <b>አዲስ ኮሚሽን!</b>\n\n` +
        `📦 ${data.productName || 'ምርት'} ተሽጧል\n` +
        `💰 ኮሚሽንዎ: <b>${data.amount} ${data.currency}</b>\n\n` +
        `ሂሳብዎን ከአጋር ገጽዎ ይከታተሉ።`,
      this.webAppButton('🤝 አጋር ገጽ', '/affiliate'),
    );
  }
}
