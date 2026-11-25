import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { AffiliatesService } from '../affiliates/affiliates.service';
import { RewardsService } from '../rewards/rewards.service';
import { UsersService } from '../users/users.service';
import { TelegramService, escapeHtml, tgEmoji } from '../telegram/telegram.service';
import { BotStateService } from './bot-state.service';
import { BotEmojiService } from './bot-emoji.service';
import { BotLang } from './bot-i18n.service';

@Injectable()
export class BotCheckoutService {
  private readonly logger = new Logger(BotCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly payments: PaymentsService,
    private readonly affiliates: AffiliatesService,
    private readonly rewards: RewardsService,
    private readonly users: UsersService,
    private readonly telegram: TelegramService,
    private readonly state: BotStateService,
    private readonly emojis: BotEmojiService,
  ) {}

  get providerToken(): string {
    return (this.config.get<string>('TELEGRAM_PAYMENT_PROVIDER_TOKEN') || '').trim();
  }

  get hasNativeTelegramChapa(): boolean {
    return this.providerToken.length > 10;
  }

  /**
   * Direct Buy Now checkout (no cart) inside Telegram chat:
   * 1. Native Telegram Payments (sendInvoice with BotFather Chapa provider_token)
   * 2. Chapa Hosted Checkout link button (returning to https://t.me/<bot>?start=order_check)
   * 3. Mock test confirmation button (when PAYMENT_MODE=mock)
   */
  async buyNow(params: {
    chatId: string | number;
    from: { id: number | string; first_name?: string; last_name?: string; username?: string };
    productId: string;
    quantity: number;
    lang: BotLang;
    useCredit?: boolean;
  }) {
    const telegramId = String(params.from.id);
    const qty = Math.max(1, Math.min(50, Math.floor(params.quantity || 1)));

    const [product, tgUser, userState] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: params.productId } }),
      this.prisma.tgUser.findUnique({ where: { telegramId } }),
      this.state.getState(telegramId),
    ]);

    if (tgUser?.isBanned) {
      await this.telegram.sendMessage(
        params.chatId,
        `🚫 <b>Account suspended.</b>${tgUser.banReason ? `\n${escapeHtml(tgUser.banReason)}` : ''}`,
      );
      return;
    }

    if (!product) {
      await this.telegram.sendMessage(params.chatId, '❌ Product not found.');
      return;
    }

    if (product.stock <= 0) {
      await this.telegram.sendMessage(
        params.chatId,
        `🔴 <b>${escapeHtml(product.name)}</b> ${params.lang === 'am' ? 'አልቋል።' : 'is out of stock.'}`,
      );
      return;
    }

    const supplierBacked = ['HUBX', 'GEMINIPRO'].includes(product.source || '');
    if (!supplierBacked && product.stock < qty) {
      await this.telegram.sendMessage(
        params.chatId,
        `⚠️ <b>${escapeHtml(product.name)}</b>: only <b>${product.stock}</b> left in stock.`,
      );
      return;
    }

    const vipDiscountPct = Math.min(95, Math.max(0, Number(tgUser?.customDiscountPct || 0)));
    const unitPrice =
      vipDiscountPct > 0
        ? Math.max(1, Math.round(product.price * (1 - vipDiscountPct / 100)))
        : product.price;
    const rawTotal = unitPrice * qty;

    let creditUsed = 0;
    if (params.useCredit) {
      creditUsed = await this.rewards.consumeStoreCredit(telegramId, rawTotal);
    }
    const finalTotal = Math.max(1, Math.round((rawTotal - creditUsed) * 100) / 100);

    // Log BUY_CLICK analytics event
    void this.users.trackEvent({
      telegramId,
      eventType: 'BUY_CLICK',
      productId: product.id,
      productName: product.name,
      amount: finalTotal,
      meta: { quantity: qty, vipDiscountPct, creditUsed },
    });

    const refToTry = userState.pendingRef || tgUser?.invitedById || undefined;
    let affiliate = await this.affiliates.resolveRefCode(refToTry);
    if (!affiliate && tgUser?.invitedById) {
      affiliate = await this.prisma.affiliate.findFirst({
        where: { telegramUserId: tgUser.invitedById, status: 'ACTIVE' },
      });
    }

    const customerName =
      [params.from.first_name, params.from.last_name].filter(Boolean).join(' ') ||
      params.from.username ||
      'Customer';

    // 1. Native Telegram Chapa Invoice
    if (this.hasNativeTelegramChapa) {
      const txRef = `KVC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, '0')}`;

      await this.prisma.order.create({
        data: {
          txRef,
          cartRef: txRef,
          productId: product.id,
          quantity: qty,
          amount: finalTotal,
          currency: 'ETB',
          customerName,
          customerEmail: '',
          telegramUserId: telegramId,
          telegramUsername: params.from.username || null,
          refCode: affiliate?.code || null,
          affiliateId: affiliate?.id || null,
          creditUsed,
          status: 'PENDING',
          paymentMode: 'telegram_chapa',
        },
      });

      const banner = /^https?:\/\//i.test(product.bannerUrl || '') ? product.bannerUrl : undefined;
      const invoiceDesc = [
        `${qty}× ${product.name}`,
        vipDiscountPct > 0 ? `VIP -${vipDiscountPct}%` : null,
        creditUsed > 0 ? `Credit -${creditUsed} ETB` : null,
        'Instant Telegram delivery',
      ]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 250);

      const sent = await this.telegram.sendInvoice({
        chat_id: params.chatId,
        title: product.name.slice(0, 32),
        description: invoiceDesc,
        payload: txRef,
        provider_token: this.providerToken,
        currency: 'ETB',
        prices: [
          {
            label: `${product.name}${qty > 1 ? ` ×${qty}` : ''}`.slice(0, 32),
            amount: Math.max(100, Math.round(finalTotal * 100)), // Santim (1 ETB = 100)
          },
        ],
        ...(banner ? { photo_url: banner, photo_width: 800, photo_height: 450 } : {}),
        reply_markup: {
          inline_keyboard: [
            [{ text: `💳 Pay ${finalTotal.toLocaleString()} ETB · Chapa`, pay: true }],
            [{ text: 'Cancel', callback_data: `inv:cancel:${txRef}`, ...this.emojis.btnIcon('cancel') }],
          ],
        },
      });

      if (sent?.ok) return;
      this.logger.warn('Native sendInvoice failed; falling back to Chapa link / mock flow.');
    }

    // 2. Chapa Hosted Link OR Mock Test Mode
    const botUsername = await this.telegram.getBotUsername();
    try {
      const init = await this.payments.initializeCart({
        items: [{ productId: product.id, quantity: qty }],
        customerName,
        customerEmail: '',
        telegramUserId: telegramId,
        telegramUsername: params.from.username,
        refCode: affiliate?.code,
        returnUrl: botUsername ? `https://t.me/${botUsername}?start=order_check` : undefined,
      });

      // Apply VIP discount / store credit onto the pending order if different from base
      if (finalTotal !== init.amount || creditUsed > 0) {
        await this.prisma.order.updateMany({
          where: { cartRef: init.cartRef },
          data: { amount: finalTotal, creditUsed },
        });
      }

      const icon = tgEmoji(product.emojiId, '📦');
      const summary = `${icon} <b>${escapeHtml(product.name)}</b> ×${qty}`;

      if (init.mode === 'mock') {
        await this.telegram.sendMessage(
          params.chatId,
          `🧾 <b>Test Checkout Invoice</b>\n\n` +
            `${summary}\n` +
            (vipDiscountPct > 0 ? `🌟 VIP Discount: -${vipDiscountPct}%\n` : '') +
            (creditUsed > 0 ? `🎟 Store Credit: -${creditUsed.toLocaleString()} ETB\n` : '') +
            `💰 Total: <b>${finalTotal.toLocaleString()} ETB</b>\n` +
            `🔖 Ref: <code>${escapeHtml(init.cartRef)}</code>\n\n` +
            `<i>Set TELEGRAM_PAYMENT_PROVIDER_TOKEN (from @BotFather → Payments → Chapa) for native in-chat Chapa checkout.</i>`,
          {
            inline_keyboard: [
              [
                {
                  text: `🧪 Complete Test Payment (${finalTotal.toLocaleString()} ETB)`,
                  callback_data: `pm:${init.orderId}`,
                  style: 'success',
                },
              ],
              [{ text: '❌ Cancel', callback_data: 'h:0', style: 'danger' }],
            ],
          },
        );
        return;
      }

      await this.telegram.sendMessage(
        params.chatId,
        `💳 <b>Chapa Checkout Ready</b>\n\n` +
          `${summary}\n` +
          (vipDiscountPct > 0 ? `🌟 VIP Discount: -${vipDiscountPct}%\n` : '') +
          (creditUsed > 0 ? `🎟 Store Credit: -${creditUsed.toLocaleString()} ETB\n` : '') +
          `💰 Total: <b>${finalTotal.toLocaleString()} ETB</b>\n` +
          `🔖 Ref: <code>${escapeHtml(init.cartRef)}</code>\n\n` +
          `Tap <b>Pay with Chapa</b> below, then return here — your order &amp; key arrive automatically!`,
        {
          inline_keyboard: [
            [{ text: `💳 Pay ${finalTotal.toLocaleString()} ETB (Chapa)`, url: init.paymentUrl, style: 'success' }],
            [{ text: '🔄 Check Payment Status', callback_data: `pv:${init.cartRef}`, style: 'primary' }],
            [{ text: '🏠 Back to Store', callback_data: 'h:0' }],
          ],
        },
      );
    } catch (err: any) {
      await this.telegram.sendMessage(
        params.chatId,
        `❌ <b>Checkout failed:</b> ${escapeHtml(err?.message || 'Please try again.')}`,
      );
    }
  }

  /** Cancel an unpaid pending invoice cleanly so it doesn't clutter Orders or analytics. */
  async cancelPendingInvoice(txRef: string, telegramId: string) {
    if (!txRef) return;
    await this.prisma.order.updateMany({
      where: {
        OR: [{ txRef }, { cartRef: txRef }],
        telegramUserId: telegramId,
        status: 'PENDING',
      },
      data: { status: 'CANCELLED' },
    });
  }

  /** Telegram asks us within 10s before charging the buyer via Chapa. */
  async handlePreCheckoutQuery(query: any) {
    const cartRef = String(query?.invoice_payload || '').trim();
    const telegramId = String(query?.from?.id || '');
    const tgUser = telegramId
      ? await this.prisma.tgUser.findUnique({ where: { telegramId } })
      : null;

    if (tgUser?.isBanned) {
      await this.telegram.answerPreCheckoutQuery(query.id, false, 'Account is suspended.');
      return;
    }

    const orders = await this.prisma.order.findMany({
      where: { OR: [{ cartRef }, { txRef: cartRef }] },
      include: { product: true },
    });

    if (!orders.length) {
      await this.telegram.answerPreCheckoutQuery(query.id, false, 'Order expired or not found.');
      return;
    }

    if (orders.every((o) => o.status === 'PAID')) {
      await this.telegram.answerPreCheckoutQuery(query.id, false, 'This order is already paid.');
      return;
    }

    for (const o of orders) {
      if (!o.product || o.product.stock <= 0) {
        await this.telegram.answerPreCheckoutQuery(
          query.id,
          false,
          `${o.product?.name || 'Product'} is now out of stock.`,
        );
        return;
      }
      const supplierBacked = ['HUBX', 'GEMINIPRO'].includes(o.product.source || '');
      if (!supplierBacked && o.product.stock < o.quantity) {
        await this.telegram.answerPreCheckoutQuery(
          query.id,
          false,
          `Only ${o.product.stock} left for ${o.product.name}.`,
        );
        return;
      }
    }

    await this.telegram.answerPreCheckoutQuery(query.id, true);
  }

  /** Telegram confirms the Chapa payment succeeded — settle & deliver immediately. */
  async handleSuccessfulPayment(msg: any) {
    const sp = msg?.successful_payment;
    if (!sp) return;
    const cartRef = String(sp.invoice_payload || '').trim();
    const orders = await this.prisma.order.findMany({
      where: { OR: [{ cartRef }, { txRef: cartRef }] },
    });
    if (!orders.length) {
      this.logger.error(`successful_payment received for unknown payload: ${cartRef}`);
      return;
    }

    const expectedSantim = orders.reduce((s, o) => s + Math.max(100, Math.round(o.amount * 100)), 0);
    if (sp.currency !== 'ETB' || Math.abs(Number(sp.total_amount || 0) - expectedSantim) > 100) {
      this.logger.error(
        `Payment mismatch for ${cartRef}: got ${sp.total_amount} ${sp.currency}, expected ${expectedSantim} ETB`,
      );
      return;
    }

    const info = sp.order_info || {};
    await this.prisma.order.updateMany({
      where: { OR: [{ cartRef }, { txRef: cartRef }] },
      data: {
        chapaTxRef: sp.provider_payment_charge_id || sp.telegram_payment_charge_id || cartRef,
        paymentMode: 'telegram_chapa',
        ...(info.name ? { customerName: info.name } : {}),
        ...(info.email ? { customerEmail: info.email } : {}),
        ...(info.phone_number ? { customerPhone: info.phone_number } : {}),
      },
    });

    await this.payments.settleCart(cartRef);
  }
}
