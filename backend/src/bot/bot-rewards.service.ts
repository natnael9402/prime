import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RewardsService } from '../rewards/rewards.service';
import { AffiliatesService } from '../affiliates/affiliates.service';
import { TelegramService, InlineButton, escapeHtml, tgEmoji } from '../telegram/telegram.service';
import { BotStateService } from './bot-state.service';
import { BotEmojiService } from './bot-emoji.service';
import { BotLang } from './bot-i18n.service';
import { formatDeliveryForTelegram } from './bot-delivery.formatter';

function progressBar(current: number, target: number, width = 12): string {
  if (target <= 0) return '█'.repeat(width);
  const ratio = Math.min(1, Math.max(0, current / target));
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

@Injectable()
export class BotRewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rewards: RewardsService,
    private readonly affiliates: AffiliatesService,
    private readonly telegram: TelegramService,
    private readonly state: BotStateService,
    private readonly emojis: BotEmojiService,
  ) {}

  async showInviteHome(chatId: string | number, telegramId: string, lang: BotLang, messageId?: number) {
    await this.emojis.warmUiPacks();
    const data = await this.rewards.getProgress(telegramId);
    const nextTier = data.tiers.find((t) => !t.unlocked) || null;
    const target = nextTier ? nextTier.requiredInvites : data.tiers[data.tiers.length - 1]?.requiredInvites || 15;
    const bar = progressBar(data.verifiedInvites, target);
    const pct = target > 0 ? Math.min(100, Math.round((data.verifiedInvites / target) * 100)) : 100;

    const tierLines = data.tiers.length
      ? data.tiers
          .map((t) => {
            const icon = t.product?.emojiId ? tgEmoji(t.product.emojiId, '🎁') : this.emojis.html('reward', '🎁');
            if (t.claim?.status === 'DELIVERED') {
              return `${this.emojis.html('success', '✅')} <b>${t.requiredInvites} Invites</b> — ${icon} ${escapeHtml(t.title)} <i>(Claimed)</i>`;
            }
            if (t.claim?.status === 'PENDING') {
              return `${this.emojis.html('pending', '⏳')} <b>${t.requiredInvites} Invites</b> — ${icon} ${escapeHtml(t.title)} <i>(Pending)</i>`;
            }
            if (t.unlocked) {
              return `${this.emojis.html('unlock', '🎉')} <b>${t.requiredInvites} Invites</b> — ${icon} ${escapeHtml(t.title)} <b>(READY!)</b>`;
            }
            const left = t.requiredInvites - data.verifiedInvites;
            return `${this.emojis.html('lock', '🔒')} <b>${t.requiredInvites} Invites</b> — ${icon} ${escapeHtml(t.title)} <i>(${left} left)</i>`;
          })
          .join('\n')
      : lang === 'am'
        ? '<i>ሽልማቶች በቅርቡ ይጨመራሉ።</i>'
        : '<i>Reward milestones coming soon — keep sharing your link!</i>';

    const header =
      lang === 'am'
        ? `${this.emojis.html('reward', '🎁')} <b>ጓደኞችን ይጋብዙ &amp; ሽልማት ይክፈቱ!</b>`
        : `${this.emojis.html('reward', '🎁')} <b>Invite Friends &amp; Unlock Rewards!</b>`;

    const text =
      `${header}\n\n` +
      `${this.emojis.html('user', '👥')} Verified Invites: <b>${data.verifiedInvites}</b>` +
      (data.pendingInvites > 0 ? ` <i>(+${data.pendingInvites} pending channel join)</i>` : '') +
      `\n<code>${bar}</code> <b>${pct}%</b>\n` +
      (nextTier
        ? `${this.emojis.html('fire', '🎯')} <b>${nextTier.requiredInvites - data.verifiedInvites}</b> more invite(s) to unlock: <b>${escapeHtml(nextTier.title)}</b>\n`
        : data.tiers.length > 0
          ? `${this.emojis.html('trophy', '🏆')} <b>All current milestones unlocked!</b>\n`
          : '') +
      (data.storeCredit > 0 ? `${this.emojis.html('money', '💰')} Store Credit: <b>${data.storeCredit.toLocaleString()} ETB</b>\n` : '') +
      `\n<b>Milestones:</b>\n${tierLines}\n\n` +
      `${this.emojis.html('share', '🔗')} <b>Your Invite Link:</b>\n<code>${escapeHtml(data.inviteLink)}</code>` +
      (data.requiredChannel
        ? `\n\n${this.emojis.html('bell', '📢')} <i>Invited friends must join ${escapeHtml(data.requiredChannel)} to count.</i>`
        : '');

    const keyboard: InlineButton[][] = [];

    for (const tier of data.tiers) {
      if (tier.unlocked && !tier.claim) {
        keyboard.push([
          {
            text: `Claim: ${tier.title}`.slice(0, 50),
            callback_data: `rw:${tier.id}`,
            style: 'success',
            ...this.emojis.btnIcon('reward', tier.product?.emojiId),
          },
        ]);
      }
    }

    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(data.inviteLink)}&text=${encodeURIComponent(
      'Get instant digital keys & AI APIs on Access Store — pay instant in Birr right in Telegram!',
    )}`;

    keyboard.push([
      { text: 'Share Invite Link', url: shareUrl, style: 'primary', ...this.emojis.btnIcon('share') },
      { text: 'Send in Chat', switch_inline_query: '', ...this.emojis.btnIcon('fire') },
    ]);

    if (data.requiredChannel) {
      keyboard.push([{ text: 'Refresh / Verify Channel', callback_data: 'rew:verify', ...this.emojis.btnIcon('success') }]);
    }

    keyboard.push([
      { text: 'Cash Affiliate (10%)', callback_data: 'aff:dash', style: 'primary', ...this.emojis.btnIcon('affiliate') },
      { text: 'Home', callback_data: 'h:0', ...this.emojis.btnIcon('back') },
    ]);

    const markup = { inline_keyboard: keyboard };
    if (messageId) {
      const edited = await this.telegram.editMessageText(chatId, messageId, text, markup);
      if (edited) return;
    }
    await this.telegram.sendMessage(chatId, text, markup);
  }

  async handleClaimTier(chatId: string | number, telegramId: string, tierId: string, callbackId: string, lang: BotLang) {
    try {
      const res = await this.rewards.claimTier(telegramId, tierId);
      if (res.status === 'DELIVERED' && 'creditAdded' in res) {
        await this.telegram.answerCallbackQuery(callbackId, `🎉 +${res.creditAdded} ETB added!`, true);
        await this.showInviteHome(chatId, telegramId, lang);
        return;
      }
      if (res.status === 'DELIVERED' && 'order' in res && res.order) {
        await this.telegram.answerCallbackQuery(callbackId, '🎉 Reward unlocked & delivered!', true);
        const formatted = formatDeliveryForTelegram(res.order.licenseKey || '');
        const icon = tgEmoji(res.order.product?.emojiId, '🎁');
        await this.telegram.sendMessage(
          chatId,
          `🎉 <b>Reward Unlocked &amp; Delivered!</b>\n\n` +
            `${icon} <b>${escapeHtml(res.order.product?.name || 'Reward')}</b>\n` +
            `🧾 <code>${escapeHtml(res.order.txRef)}</code>\n\n` +
            formatted.html,
          {
            inline_keyboard: [
              [{ text: '📖 Activation Guide', callback_data: `og:${res.order.id}`, style: 'primary' }],
              [{ text: '🎁 Back to Rewards', callback_data: 'rew:home' }],
            ],
          },
        );
        return;
      }
      await this.telegram.answerCallbackQuery(callbackId, '⏳ Claim submitted for approval!', true);
      await this.showInviteHome(chatId, telegramId, lang);
    } catch (err: any) {
      await this.telegram.answerCallbackQuery(callbackId, err?.message || 'Could not claim reward', true);
    }
  }

  // ---------- Affiliate Cash Dashboard (10% Commission) ----------

  async showAffiliate(
    chatId: string | number,
    from: { id: number | string; first_name?: string; last_name?: string; username?: string },
    lang: BotLang,
    messageId?: number,
  ) {
    await this.emojis.warmUiPacks();
    const telegramId = String(from.id);
    const existing = await this.prisma.affiliate.findFirst({ where: { telegramUserId: telegramId } });

    if (!existing) {
      const text =
        `${this.emojis.html('affiliate', '🤝')} <b>Affiliate Cash Program (10%)</b>\n\n` +
        `${this.emojis.html('money', '💰')} Earn <b>10% cash commission</b> every time someone buys through your link — withdraw via <b>Telebirr</b> or <b>CBE Birr</b>!\n\n` +
        `Tap below to activate your affiliate account in 1 second.`;
      const markup = {
        inline_keyboard: [
          [{ text: 'Activate Affiliate (1-Tap)', callback_data: 'aff:join', style: 'success', ...this.emojis.btnIcon('fire') }],
          [{ text: 'Back to Invite Rewards', callback_data: 'rew:home', style: 'primary', ...this.emojis.btnIcon('reward') }],
          [{ text: 'Home', callback_data: 'h:0', ...this.emojis.btnIcon('back') }],
        ],
      };
      if (messageId) {
        const edited = await this.telegram.editMessageText(chatId, messageId, text, markup);
        if (edited) return;
      }
      await this.telegram.sendMessage(chatId, text, markup);
      return;
    }

    const stats = await this.affiliates.getStats(existing.code);
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(stats.link)}&text=${encodeURIComponent(
      'Get instant digital keys & AI APIs on Access Store — pay instant in Birr right in Telegram!',
    )}`;

    const recentText = stats.recentSales.length
      ? stats.recentSales
          .slice(0, 5)
          .map(
            (s: any) =>
              `• ${escapeHtml(s.product || 'Order')} — +<b>${Number(s.commission || 0).toLocaleString()} ETB</b>`,
          )
          .join('\n')
      : '<i>No sales yet — share your link to start earning!</i>';

    const text =
      `${this.emojis.html('affiliate', '💼')} <b>Affiliate Dashboard</b> (<code>${escapeHtml(stats.code)}</code>)\n\n` +
      `${this.emojis.html('chart', '📊')} Rate: <b>${Math.round(stats.commissionRate * 100)}%</b> per paid sale\n` +
      `${this.emojis.html('user', '👆')} Clicks: <b>${stats.clicks}</b> · ${this.emojis.html('shop', '🛒')} Sales: <b>${stats.sales}</b>\n` +
      `${this.emojis.html('money', '💰')} Pending: <b>${stats.pending.toLocaleString()} ETB</b>\n` +
      `${this.emojis.html('success', '✅')} Paid Out: <b>${stats.paid.toLocaleString()} ETB</b>\n\n` +
      `${this.emojis.html('share', '🔗')} <b>Your Affiliate Link:</b>\n<code>${escapeHtml(stats.link)}</code>\n\n` +
      `<b>Recent Commissions:</b>\n${recentText}`;

    const keyboard: InlineButton[][] = [
      [{ text: 'Share Affiliate Link', url: shareUrl, style: 'primary', ...this.emojis.btnIcon('share') }],
    ];

    if (stats.pending > 0) {
      keyboard.push([
        {
          text: `Request Payout (${stats.pending.toLocaleString()} ETB)`,
          callback_data: 'aff:pay',
          style: 'success',
          ...this.emojis.btnIcon('money'),
        },
      ]);
    }

    keyboard.push([
      { text: 'Invite Rewards', callback_data: 'rew:home', ...this.emojis.btnIcon('reward') },
      { text: 'Home', callback_data: 'h:0', ...this.emojis.btnIcon('back') },
    ]);

    const markup = { inline_keyboard: keyboard };
    if (messageId) {
      const edited = await this.telegram.editMessageText(chatId, messageId, text, markup);
      if (edited) return;
    }
    await this.telegram.sendMessage(chatId, text, markup);
  }

  async joinAffiliate(
    chatId: string | number,
    from: { id: number | string; first_name?: string; last_name?: string; username?: string },
    lang: BotLang,
    messageId?: number,
  ) {
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Partner';
    await this.affiliates.join({
      name,
      telegramUserId: String(from.id),
      telegramUsername: from.username,
    });
    await this.showAffiliate(chatId, from, lang, messageId);
  }

  async startPayoutWizard(chatId: string | number, messageId?: number) {
    const text = `${this.emojis.html('money', '💸')} <b>Request Payout</b>\n\nChoose your payout method:`;
    const markup = {
      inline_keyboard: [
        [
          { text: 'Telebirr', callback_data: 'aff:m:telebirr', style: 'success', ...this.emojis.btnIcon('pay') },
          { text: 'CBE Birr', callback_data: 'aff:m:cbe', style: 'primary', ...this.emojis.btnIcon('money') },
        ],
        [{ text: 'Cancel', callback_data: 'aff:dash', style: 'danger', ...this.emojis.btnIcon('cancel') }],
      ],
    };
    if (messageId) {
      const edited = await this.telegram.editMessageText(chatId, messageId, text, markup);
      if (edited) return;
    }
    await this.telegram.sendMessage(chatId, text, markup);
  }

  async pickPayoutMethod(chatId: string | number, telegramId: string, method: 'telebirr' | 'cbe') {
    await this.state.setState(telegramId, { inputStep: 'AFF_PAYOUT_ACCOUNT', payoutMethod: method });
    const prompt =
      method === 'telebirr'
        ? '📱 Send your <b>Telebirr phone number</b> (e.g. <code>0912345678</code>):'
        : '🏦 Send your <b>CBE account number</b>:';
    await this.telegram.sendMessage(chatId, prompt, {
      inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'aff:cancel_input', style: 'danger' }]],
    });
  }

  async handlePayoutAccountInput(
    chatId: string | number,
    from: { id: number | string; first_name?: string; last_name?: string; username?: string },
    accountInput: string,
    lang: BotLang,
  ) {
    const telegramId = String(from.id);
    const st = await this.state.getState(telegramId);
    const method = st.payoutMethod || 'telebirr';
    const aff = await this.prisma.affiliate.findFirst({ where: { telegramUserId: telegramId } });
    if (!aff) {
      await this.state.setState(telegramId, { inputStep: null, payoutMethod: null });
      return;
    }

    try {
      await this.affiliates.requestPayout({ code: aff.code, method, account: accountInput.trim() });
      await this.state.setState(telegramId, { inputStep: null, payoutMethod: null });
      await this.telegram.sendMessage(
        chatId,
        `✅ <b>Payout Request Submitted!</b>\n\n` +
          `Method: <b>${method === 'telebirr' ? 'Telebirr' : 'CBE Birr'}</b>\n` +
          `Account: <code>${escapeHtml(accountInput.trim())}</code>\n\n` +
          `We'll process it shortly and notify you.`,
        {
          inline_keyboard: [[{ text: '💼 Back to Dashboard', callback_data: 'aff:dash', style: 'primary' }]],
        },
      );
    } catch (err: any) {
      await this.telegram.sendMessage(
        chatId,
        `⚠️ ${escapeHtml(err?.message || 'Invalid account number')}\n\nPlease try again or tap Cancel.`,
        {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'aff:cancel_input', style: 'danger' }]],
        },
      );
    }
  }
}
