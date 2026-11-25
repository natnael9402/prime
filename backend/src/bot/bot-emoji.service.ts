import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService, tgEmoji } from '../telegram/telegram.service';
import { RedisService } from '../infra/redis.service';

export interface EmojiPackItem {
  customEmojiId: string;
  emoji: string;
  fileId: string;
  thumbFileId: string | null;
  isAnimated: boolean;
  isVideo: boolean;
}

export type UiEmojiRole =
  | 'store'
  | 'shop'
  | 'featured'
  | 'product'
  | 'key'
  | 'money'
  | 'pay'
  | 'credit'
  | 'orders'
  | 'invite'
  | 'reward'
  | 'trophy'
  | 'search'
  | 'lang'
  | 'support'
  | 'bell'
  | 'share'
  | 'affiliate'
  | 'chart'
  | 'success'
  | 'pending'
  | 'fire'
  | 'guide'
  | 'details'
  | 'back'
  | 'user'
  | 'lock'
  | 'unlock'
  | 'cancel';

const ROLE_CANDIDATES: Record<UiEmojiRole, string[]> = {
  store: ['💎', '🛍️', '🛍', '🏪', '✨', '⚡'],
  shop: ['🛍️', '🛍', '🛒', '💎', '🏪', '📦'],
  featured: ['⭐', '🌟', '🔥', '⚡', '✨', '💎'],
  product: ['📦', '💎', '🔑', '⚡', '✨', '🎁'],
  key: ['🔑', '🗝️', '🔐', '💎', '⚡'],
  money: ['💰', '💵', '💸', '🪙', '💲', '🏦', '💳', '💎'],
  pay: ['💳', '💵', '💰', '💸', '⚡', '🏦'],
  credit: ['🎟️', '🎟', '🪙', '💰', '💵', '🎁'],
  orders: ['📦', '🧾', '📋', '🛍️', '✅'],
  invite: ['🎁', '🎉', '👥', '🤝', '🚀', '💎'],
  reward: ['🎁', '🏆', '🥇', '🎉', '💎', '⭐'],
  trophy: ['🏆', '🥇', '👑', '⭐', '💎'],
  search: ['🔍', '🔎', '📰', '📋', '💡'],
  lang: ['🌐', '🌍', '🌎', '🗺️', '💬'],
  support: ['💬', '❓', '💡', '📢', '📰'],
  bell: ['🔔', '📢', '📣', '⚡', '📰'],
  share: ['📤', '🔗', '🚀', '📢', '✈️'],
  affiliate: ['🤝', '💼', '📈', '💸', '💰'],
  chart: ['📊', '📈', '💹', '💰', '📰'],
  success: ['✅', '☑️', '✔️', '🟢', '🎉'],
  pending: ['⏳', '🕒', '⌛', '🔄'],
  fire: ['🔥', '⚡', '🚀', '✨', '💥'],
  guide: ['📖', '📘', '📰', '📋', '💡'],
  details: ['📋', '📰', 'ℹ️', '📄', '🔍'],
  back: ['⬅️', '◀️', '🔙', '↩️'],
  user: ['👤', '👥', '🧑', '🙋'],
  lock: ['🔒', '🔐', '🛡️'],
  unlock: ['🔓', '🎉', '✨', '🔑'],
  cancel: ['❌', '✖️', '🚫', '🔴'],
};

@Injectable()
export class BotEmojiService implements OnModuleInit {
  private readonly logger = new Logger(BotEmojiService.name);
  private unicodeToId = new Map<string, string>();
  private poolIds: string[] = [];
  private loaded = false;
  private lastLoadAt = 0;

  constructor(
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  get defaultPackName(): string {
    return (this.config.get<string>('TELEGRAM_EMOJI_PACK') || 'hubxemoji').trim();
  }

  get uiPackNames(): string[] {
    const raw = (this.config.get<string>('TELEGRAM_UI_EMOJI_PACKS') || '').trim();
    const list = raw
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : ['FinanceEmoji', 'NewsEmoji', this.defaultPackName];
    return [...new Set(list)];
  }

  onModuleInit() {
    if (!this.telegram.enabled) return;
    if ((this.config.get<string>('TELEGRAM_ENABLE_BOT') || 'true') === 'false') return;
    setTimeout(() => void this.warmUiPacks(), 1500).unref();
  }

  async warmUiPacks(force = false) {
    if (!this.telegram.enabled) return;
    if (!force && this.loaded && Date.now() - this.lastLoadAt < 30 * 60_000) return;

    this.lastLoadAt = Date.now();
    const nextMap = new Map<string, string>();
    const nextPool: string[] = [];

    for (const packName of this.uiPackNames) {
      try {
        const res = await this.getPack(packName);
        if (res?.stickers?.length) {
          for (const s of res.stickers) {
            if (!s.customEmojiId) continue;
            nextPool.push(s.customEmojiId);
            const rawEmoji = String(s.emoji || '').trim();
            if (rawEmoji && !nextMap.has(rawEmoji)) {
              nextMap.set(rawEmoji, s.customEmojiId);
            }
            // Also index without variation selector (\uFE0F) for reliable lookup
            const stripped = rawEmoji.replace(/\uFE0F/g, '');
            if (stripped && !nextMap.has(stripped)) {
              nextMap.set(stripped, s.customEmojiId);
            }
          }
          this.logger.log(`Loaded ${res.stickers.length} custom emojis from pack "${packName}".`);
        }
      } catch (err: any) {
        this.logger.warn(`Failed loading emoji pack "${packName}": ${err?.message}`);
      }
    }

    if (nextMap.size > 0) {
      this.unicodeToId = nextMap;
      this.poolIds = nextPool;
      this.loaded = true;
    }
  }

  /** Resolve a custom_emoji_id for a UI role (from FinanceEmoji, NewsEmoji, hubxemoji). */
  resolveId(role: UiEmojiRole): string | null {
    const candidates = ROLE_CANDIDATES[role] || [];
    for (const c of candidates) {
      const hit = this.unicodeToId.get(c) || this.unicodeToId.get(c.replace(/\uFE0F/g, ''));
      if (hit) return hit;
    }
    return null;
  }

  /** HTML custom emoji tag with guaranteed Unicode fallback. */
  html(role: UiEmojiRole, fallback: string): string {
    const id = this.resolveId(role);
    return id ? tgEmoji(id, fallback) : fallback;
  }

  /** Inline/reply button icon helper: returns `{ icon_custom_emoji_id }` when available. */
  btnIcon(role: UiEmojiRole, overrideId?: string | null): { icon_custom_emoji_id?: string } {
    const id = overrideId && /^\d{10,25}$/.test(overrideId) ? overrideId : this.resolveId(role);
    return id ? { icon_custom_emoji_id: id } : {};
  }

  /** Deterministic fallback custom emoji for products without an explicit emojiId. */
  productEmojiId(product: { emojiId?: string | null }): string | null {
    if (product?.emojiId && /^\d{10,25}$/.test(product.emojiId)) return product.emojiId;
    return this.resolveId('product') || this.resolveId('key') || this.poolIds[0] || null;
  }

  async getPack(packName?: string) {
    const clean = (packName || this.defaultPackName)
      .replace(/^https?:\/\/t\.me\/(addemoji|addstickers)\//i, '')
      .replace(/[^A-Za-z0-9_]/g, '')
      .trim();
    if (!clean) throw new ServiceUnavailableException('Emoji pack name is required');

    const cacheKey = `bot:emojipack:${clean}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }

    if (!this.telegram.enabled) {
      return {
        name: clean,
        title: clean,
        stickerType: 'custom_emoji',
        configured: false,
        stickers: [] as EmojiPackItem[],
      };
    }

    const set = await this.telegram.getStickerSet(clean);
    if (!set) {
      return {
        name: clean,
        title: clean,
        stickerType: 'custom_emoji',
        configured: true,
        stickers: [] as EmojiPackItem[],
      };
    }

    const stickers: EmojiPackItem[] = (set.stickers || []).map((s: any) => ({
      customEmojiId: s.custom_emoji_id || '',
      emoji: s.emoji || '✨',
      fileId: s.file_id || '',
      thumbFileId: s.thumbnail?.file_id || s.thumb?.file_id || s.file_id || null,
      isAnimated: !!s.is_animated,
      isVideo: !!s.is_video,
    }));

    const payload = {
      name: set.name || clean,
      title: set.title || clean,
      stickerType: set.sticker_type || 'custom_emoji',
      configured: true,
      stickers,
    };

    await this.redis.set(cacheKey, JSON.stringify(payload), 1800);
    return payload;
  }
}
