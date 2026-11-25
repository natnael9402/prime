import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService, escapeHtml, tgEmoji } from '../telegram/telegram.service';
import { LicensesService } from '../licenses/licenses.service';
import { SupplierService } from '../supplier/supplier.service';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private telegram: TelegramService,
    private licensesService: LicensesService,
    private supplierService: SupplierService,
  ) {}

  get requiredChannel(): string | null {
    const ch = (this.config.get<string>('TELEGRAM_REQUIRED_CHANNEL') || '').trim();
    return ch || null;
  }

  private generateReferralCode(): string {
    let s = '';
    for (let i = 0; i < 6; i++) {
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return `U${s}`;
  }

  private async uniqueReferralCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = this.generateReferralCode();
      const hit = await this.prisma.tgUser.findUnique({ where: { referralCode: code } });
      if (!hit) return code;
    }
    return `U${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }

  /**
   * Upsert a Telegram user on bot interaction.
   * Invite attribution only succeeds for brand-new users (prevents self/repeat farming).
   */
  async ensureTgUser(
    from: {
      id: number | string;
      is_bot?: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    },
    inviterRef?: string | null,
  ) {
    const telegramId = String(from.id);
    const existing = await this.prisma.tgUser.findUnique({ where: { telegramId } });

    if (existing) {
      let referralCode = existing.referralCode;
      if (!referralCode) referralCode = await this.uniqueReferralCode();

      const updated = await this.prisma.tgUser.update({
        where: { telegramId },
        data: {
          firstName: from.first_name ?? existing.firstName,
          lastName: from.last_name ?? existing.lastName,
          username: from.username ?? existing.username,
          referralCode,
        },
      });
      return { user: updated, isNew: false, invitedNow: false };
    }

    let invitedById: string | null = null;
    if (inviterRef && !from.is_bot) {
      const cleanRef = inviterRef.trim();
      // Match TgUser by referralCode or telegramId, OR Affiliate.code -> telegramUserId
      const inviterTg = await this.prisma.tgUser.findFirst({
        where: { OR: [{ referralCode: cleanRef }, { telegramId: cleanRef }] },
        select: { telegramId: true },
      });
      if (inviterTg && inviterTg.telegramId !== telegramId) {
        invitedById = inviterTg.telegramId;
      } else {
        const aff = await this.prisma.affiliate.findUnique({
          where: { code: cleanRef },
          select: { telegramUserId: true },
        });
        if (aff?.telegramUserId && aff.telegramUserId !== telegramId) {
          invitedById = aff.telegramUserId;
        }
      }
    }

    const referralCode = await this.uniqueReferralCode();
    const initialLang = from.language_code === 'am' ? 'am' : 'en';
    const inviteVerified = !!invitedById && !this.requiredChannel;

    const created = await this.prisma.tgUser.create({
      data: {
        telegramId,
        firstName: from.first_name || null,
        lastName: from.last_name || null,
        username: from.username || null,
        languageCode: initialLang,
        referralCode,
        invitedById,
        inviteVerified,
      },
    });

    if (invitedById && inviteVerified) {
      void this.notifyInviterProgress(invitedById, created.firstName || created.username || 'Friend');
    }

    return { user: created, isNew: true, invitedNow: !!invitedById };
  }

  /** Verify required channel membership (if configured) and unlock pending invite credit. */
  async verifyChannelJoin(telegramId: string): Promise<{ joined: boolean; channel: string | null }> {
    const channel = this.requiredChannel;
    const user = await this.prisma.tgUser.findUnique({ where: { telegramId } });
    if (!channel) {
      if (user?.invitedById && !user.inviteVerified) {
        await this.prisma.tgUser.update({ where: { telegramId }, data: { inviteVerified: true } });
        void this.notifyInviterProgress(user.invitedById, user.firstName || user.username || 'Friend');
      }
      return { joined: true, channel: null };
    }

    const status = await this.telegram.getChatMember(channel, telegramId);
    const joined = ['creator', 'administrator', 'member', 'restricted'].includes(status || '');
    if (joined && user?.invitedById && !user.inviteVerified) {
      await this.prisma.tgUser.update({ where: { telegramId }, data: { inviteVerified: true } });
      void this.notifyInviterProgress(user.invitedById, user.firstName || user.username || 'Friend');
    }
    return { joined, channel };
  }

  private async notifyInviterProgress(inviterTelegramId: string, inviteeName: string) {
    try {
      const [verifiedCount, nextTier] = await Promise.all([
        this.prisma.tgUser.count({ where: { invitedById: inviterTelegramId, inviteVerified: true } }),
        this.prisma.rewardTier.findFirst({
          where: { enabled: true },
          orderBy: { requiredInvites: 'asc' },
          include: { product: { select: { name: true, emojiId: true } } },
        }),
      ]);
      const tiers = await this.prisma.rewardTier.findMany({
        where: { enabled: true },
        orderBy: { requiredInvites: 'asc' },
        include: { product: { select: { name: true, emojiId: true } } },
      });
      const upcoming = tiers.find((t) => t.requiredInvites > verifiedCount) || nextTier;
      const unlockedNow = tiers.find((t) => t.requiredInvites === verifiedCount);

      let msg =
        `🎉 <b>አዲስ ተጋባዥ ተቀላቅሏል! / New Invite Joined!</b>\n\n` +
        `👤 ${escapeHtml(inviteeName)} joined using your link!\n` +
        `👥 Verified Invites: <b>${verifiedCount}</b>\n`;

      if (unlockedNow) {
        const icon = tgEmoji(unlockedNow.product?.emojiId, '🎁');
        msg += `\n🔓 <b>UNLOCKED:</b> ${icon} <b>${escapeHtml(unlockedNow.title)}</b>!\nTap below to claim your reward!`;
      } else if (upcoming) {
        const left = Math.max(0, upcoming.requiredInvites - verifiedCount);
        msg += `🎯 <b>${left}</b> more invite(s) to unlock <b>${escapeHtml(upcoming.title)}</b>!`;
      }

      await this.telegram.sendMessage(inviterTelegramId, msg, {
        inline_keyboard: [
          [
            {
              text: unlockedNow ? '🎉 Claim Reward Now' : '🎁 View Invite Progress',
              callback_data: 'rew:home',
              style: unlockedNow ? 'success' : 'primary',
            },
          ],
        ],
      });
    } catch {}
  }

  async setLanguage(telegramId: string, lang: 'en' | 'am') {
    await this.prisma.tgUser.updateMany({
      where: { telegramId },
      data: { languageCode: lang },
    });
  }

  async getProgress(telegramId: string) {
    const user = await this.prisma.tgUser.findUnique({ where: { telegramId } });
    if (!user) throw new NotFoundException('User not found');

    const [verifiedInvites, pendingInvites, tiers, claims, botUsername] = await Promise.all([
      this.prisma.tgUser.count({ where: { invitedById: telegramId, inviteVerified: true } }),
      this.prisma.tgUser.count({ where: { invitedById: telegramId, inviteVerified: false } }),
      this.prisma.rewardTier.findMany({
        where: { enabled: true },
        orderBy: [{ requiredInvites: 'asc' }, { order: 'asc' }],
        include: { product: { select: { id: true, name: true, price: true, currency: true, emojiId: true, stock: true } } },
      }),
      this.prisma.rewardClaim.findMany({ where: { telegramUserId: telegramId } }),
      this.telegram.getBotUsername(),
    ]);

    const claimMap = new Map(claims.map((c) => [c.tierId, c]));
    const code = user.referralCode || user.telegramId;
    const inviteLink = botUsername
      ? `https://t.me/${botUsername}?start=r_${code}`
      : `r_${code}`;

    return {
      user,
      code,
      inviteLink,
      verifiedInvites,
      pendingInvites,
      storeCredit: user.storeCredit || 0,
      requiredChannel: this.requiredChannel,
      tiers: tiers.map((t) => {
        const claim = claimMap.get(t.id) || null;
        return {
          ...t,
          unlocked: verifiedInvites >= t.requiredInvites,
          claim,
        };
      }),
    };
  }

  async claimTier(telegramId: string, tierId: string) {
    const [user, tier, existingClaim, verifiedInvites] = await Promise.all([
      this.prisma.tgUser.findUnique({ where: { telegramId } }),
      this.prisma.rewardTier.findUnique({
        where: { id: tierId },
        include: { product: { include: { activationGuide: true } } },
      }),
      this.prisma.rewardClaim.findUnique({
        where: { telegramUserId_tierId: { telegramUserId: telegramId, tierId } },
      }),
      this.prisma.tgUser.count({ where: { invitedById: telegramId, inviteVerified: true } }),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (!tier || !tier.enabled) throw new NotFoundException('Reward tier not available');
    if (existingClaim) throw new BadRequestException('Reward already claimed');
    if (verifiedInvites < tier.requiredInvites) {
      throw new BadRequestException(`Need ${tier.requiredInvites} verified invites (currently ${verifiedInvites})`);
    }

    if (tier.rewardType === 'STORE_CREDIT') {
      const credit = Math.max(0, Number(tier.creditAmount || 0));
      const [claim] = await this.prisma.$transaction([
        this.prisma.rewardClaim.create({
          data: {
            telegramUserId: telegramId,
            tierId: tier.id,
            status: 'DELIVERED',
            note: `+${credit} ETB Store Credit`,
          },
        }),
        this.prisma.tgUser.update({
          where: { telegramId },
          data: { storeCredit: { increment: credit } },
        }),
      ]);
      void this.prisma.userEvent
        .create({
          data: { telegramId, eventType: 'REWARD_CLAIM', amount: credit, meta: JSON.stringify({ tierId: tier.id, title: tier.title }) },
        })
        .catch(() => undefined);
      return { status: 'DELIVERED', claim, creditAdded: credit };
    }

    // PRODUCT reward
    if (!tier.productId || !tier.product) {
      const claim = await this.prisma.rewardClaim.create({
        data: { telegramUserId: telegramId, tierId: tier.id, status: 'PENDING', note: 'Manual reward fulfillment' },
      });
      return { status: 'PENDING', claim };
    }

    const canAutoDeliver = tier.autoDeliver && tier.product.stock > 0;
    if (!canAutoDeliver) {
      const claim = await this.prisma.rewardClaim.create({
        data: {
          telegramUserId: telegramId,
          tierId: tier.id,
          status: 'PENDING',
          note: tier.product.stock <= 0 ? 'Awaiting restock' : 'Awaiting admin approval',
        },
      });
      void this.telegram.notifyAdmin(
        `🎁 <b>Reward Claim Pending</b>\n` +
          `👤 ${escapeHtml(user.firstName || user.username || telegramId)} (${verifiedInvites} invites)\n` +
          `🏆 ${escapeHtml(tier.title)}\n` +
          `📦 ${escapeHtml(tier.product.name)}`,
      );
      return { status: 'PENDING', claim };
    }

    return this.deliverProductReward(user, tier);
  }

  private async deliverProductReward(user: any, tier: any, existingClaimId?: string) {
    const txRef = `REW-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 10000)}`;
    const customerName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Winner';

    const order = await this.prisma.order.create({
      data: {
        txRef,
        cartRef: txRef,
        productId: tier.product.id,
        quantity: 1,
        amount: 0,
        currency: 'ETB',
        customerName,
        customerEmail: '',
        telegramUserId: user.telegramId,
        telegramUsername: user.username || null,
        status: 'PAID',
        paymentMode: 'reward',
        fulfillmentStatus: 'NONE',
      },
    });

    try {
      let licenseKey: string | null = null;
      if (tier.product.supplierProductId && ['HUBX', 'GEMINIPRO'].includes(tier.product.source || '')) {
        const res = await this.supplierService.fulfillOrder(order.id);
        licenseKey = res?.items?.join('\n') || null;
      } else {
        licenseKey = await this.licensesService.allocateKeyForOrder(tier.product.id, order.id, 1);
        await this.prisma.order.update({
          where: { id: order.id },
          data: { licenseKey, fulfillmentStatus: 'DELIVERED' },
        });
      }

      const freshOrder = await this.prisma.order.findUnique({
        where: { id: order.id },
        include: { product: { include: { activationGuide: true } } },
      });

      const claim = existingClaimId
        ? await this.prisma.rewardClaim.update({
            where: { id: existingClaimId },
            data: { status: 'DELIVERED', orderId: order.id, licenseKey: freshOrder?.licenseKey || licenseKey },
          })
        : await this.prisma.rewardClaim.create({
            data: {
              telegramUserId: user.telegramId,
              tierId: tier.id,
              status: 'DELIVERED',
              orderId: order.id,
              licenseKey: freshOrder?.licenseKey || licenseKey,
            },
          });

      return { status: 'DELIVERED', claim, order: freshOrder };
    } catch (err: any) {
      this.logger.warn(`Reward delivery failed for ${user.telegramId}: ${err?.message}`);
      await this.prisma.order.update({
        where: { id: order.id },
        data: { fulfillmentStatus: 'FAILED', fulfillmentError: String(err?.message || '').slice(0, 400) },
      });
      const claim = existingClaimId
        ? await this.prisma.rewardClaim.update({
            where: { id: existingClaimId },
            data: { status: 'PENDING', orderId: order.id, note: `Delivery retry needed: ${err?.message}` },
          })
        : await this.prisma.rewardClaim.create({
            data: {
              telegramUserId: user.telegramId,
              tierId: tier.id,
              status: 'PENDING',
              orderId: order.id,
              note: `Delivery retry needed: ${err?.message}`,
            },
          });
      return { status: 'PENDING', claim };
    }
  }

  /** Deduct store credit safely during checkout. */
  async consumeStoreCredit(telegramId: string, maxAmount: number): Promise<number> {
    if (!telegramId || maxAmount <= 0) return 0;
    const user = await this.prisma.tgUser.findUnique({ where: { telegramId } });
    if (!user || (user.storeCredit || 0) <= 0) return 0;
    const apply = Math.min(user.storeCredit, Math.max(0, maxAmount - 10)); // Leave >= 10 ETB if live Chapa requires positive charge, or allow full if needed
    if (apply <= 0) return 0;
    await this.prisma.tgUser.update({
      where: { telegramId },
      data: { storeCredit: { decrement: apply } },
    });
    return Math.round(apply * 100) / 100;
  }

  // ---------- Admin ----------

  async adminListTiers() {
    return this.prisma.rewardTier.findMany({
      orderBy: [{ requiredInvites: 'asc' }, { order: 'asc' }],
      include: {
        product: { select: { id: true, name: true, price: true, stock: true, emojiId: true } },
        _count: { select: { claims: true } },
      },
    });
  }

  async createTier(dto: {
    title: string;
    description?: string;
    requiredInvites: number;
    rewardType: string;
    productId?: string | null;
    creditAmount?: number | null;
    autoDeliver?: boolean;
    enabled?: boolean;
  }) {
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');
    const requiredInvites = Math.max(1, Math.floor(Number(dto.requiredInvites) || 15));
    return this.prisma.rewardTier.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        requiredInvites,
        rewardType: dto.rewardType === 'STORE_CREDIT' ? 'STORE_CREDIT' : 'PRODUCT',
        productId: dto.rewardType === 'STORE_CREDIT' ? null : dto.productId || null,
        creditAmount: dto.rewardType === 'STORE_CREDIT' ? Number(dto.creditAmount || 0) : null,
        autoDeliver: dto.autoDeliver !== false,
        enabled: dto.enabled !== false,
      },
      include: { product: { select: { id: true, name: true, price: true, stock: true, emojiId: true } } },
    });
  }

  async updateTier(id: string, dto: Partial<{
    title: string;
    description: string | null;
    requiredInvites: number;
    rewardType: string;
    productId: string | null;
    creditAmount: number | null;
    autoDeliver: boolean;
    enabled: boolean;
  }>) {
    const existing = await this.prisma.rewardTier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Reward tier not found');
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.requiredInvites !== undefined) data.requiredInvites = Math.max(1, Math.floor(Number(dto.requiredInvites)));
    if (dto.rewardType !== undefined) data.rewardType = dto.rewardType === 'STORE_CREDIT' ? 'STORE_CREDIT' : 'PRODUCT';
    if (dto.productId !== undefined) data.productId = dto.productId || null;
    if (dto.creditAmount !== undefined) data.creditAmount = dto.creditAmount === null ? null : Number(dto.creditAmount);
    if (dto.autoDeliver !== undefined) data.autoDeliver = !!dto.autoDeliver;
    if (dto.enabled !== undefined) data.enabled = !!dto.enabled;
    return this.prisma.rewardTier.update({
      where: { id },
      data,
      include: { product: { select: { id: true, name: true, price: true, stock: true, emojiId: true } } },
    });
  }

  async deleteTier(id: string) {
    await this.prisma.rewardTier.delete({ where: { id } });
    return { deleted: true };
  }

  async adminListClaims(status?: string) {
    const where: any = {};
    if (status && status !== 'all') where.status = status.toUpperCase();
    const claims = await this.prisma.rewardClaim.findMany({
      where,
      include: { tier: { include: { product: { select: { id: true, name: true, emojiId: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const tgIds = [...new Set(claims.map((c) => c.telegramUserId))];
    const users = await this.prisma.tgUser.findMany({
      where: { telegramId: { in: tgIds } },
      select: { telegramId: true, firstName: true, lastName: true, username: true },
    });
    const uMap = new Map(users.map((u) => [u.telegramId, u]));
    return claims.map((c) => ({ ...c, user: uMap.get(c.telegramUserId) || null }));
  }

  async approveClaim(claimId: string) {
    const claim = await this.prisma.rewardClaim.findUnique({
      where: { id: claimId },
      include: { tier: { include: { product: { include: { activationGuide: true } } } } },
    });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.status === 'DELIVERED') return claim;

    const user = await this.prisma.tgUser.findUnique({ where: { telegramId: claim.telegramUserId } });
    if (!user) throw new NotFoundException('User not found');

    if (claim.tier.rewardType === 'STORE_CREDIT') {
      const credit = Math.max(0, Number(claim.tier.creditAmount || 0));
      const [updated] = await this.prisma.$transaction([
        this.prisma.rewardClaim.update({ where: { id: claimId }, data: { status: 'DELIVERED' } }),
        this.prisma.tgUser.update({ where: { telegramId: user.telegramId }, data: { storeCredit: { increment: credit } } }),
      ]);
      void this.telegram.sendMessage(
        user.telegramId,
        `🎉 <b>Your Reward Was Approved!</b>\n💰 +<b>${credit} ETB</b> store credit added to your account.`,
      );
      return updated;
    }

    if (claim.tier.product) {
      const res = await this.deliverProductReward(user, claim.tier, claim.id);
      if (res.status === 'DELIVERED' && res.order) {
        await this.telegram.notifyOrderPaid({
          txRef: res.order.txRef,
          customerName: res.order.customerName,
          amount: 0,
          currency: 'ETB',
          licenseKey: res.order.licenseKey,
          telegramUserId: user.telegramId,
          id: res.order.id,
          product: res.order.product,
        });
      }
      return res.claim;
    }

    return this.prisma.rewardClaim.update({ where: { id: claimId }, data: { status: 'DELIVERED' } });
  }

  async rejectClaim(claimId: string) {
    const claim = await this.prisma.rewardClaim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException('Claim not found');
    return this.prisma.rewardClaim.update({ where: { id: claimId }, data: { status: 'REJECTED' } });
  }

  async adminStats() {
    const [totalUsers, verifiedInvites, pendingInvites, tiersCount, claimsCount, pendingClaims] = await Promise.all([
      this.prisma.tgUser.count(),
      this.prisma.tgUser.count({ where: { inviteVerified: true, invitedById: { not: null } } }),
      this.prisma.tgUser.count({ where: { inviteVerified: false, invitedById: { not: null } } }),
      this.prisma.rewardTier.count(),
      this.prisma.rewardClaim.count(),
      this.prisma.rewardClaim.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      totalUsers,
      verifiedInvites,
      pendingInvites,
      tiersCount,
      claimsCount,
      pendingClaims,
      requiredChannel: this.requiredChannel,
    };
  }
}
