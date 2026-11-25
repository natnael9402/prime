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
  | 'cart'
  | 'home'
  | 'featured'
  | 'crown'
  | 'shield'
  | 'product'
  | 'key'
  | 'money'
  | 'coin'
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
  | 'rocket'
  | 'guide'
  | 'details'
  | 'back'
  | 'user'
  | 'lock'
  | 'unlock'
  | 'cancel';

/**
 * Visually verified animated custom_emoji_ids from FinanceEmoji & NewsEmoji.
 * Falls back dynamically to Unicode lookup from loaded packs if a pack changes.
 */
const PINNED_ANIMATED_IDS: Partial<Record<UiEmojiRole, string>> = {
  store: '5427168083074628963',     // NewsEmoji[66] animated glowing diamond
  shop: '5278702045883292456',      // FinanceEmoji[44] animated storefront awning
  cart: '5312361253610475399',      // FinanceEmoji[33] animated shopping cart
  home: '5416041192905265756',      // NewsEmoji[97] animated house
  featured: '5438496463044752972',  // NewsEmoji[67] animated golden star
  crown: '5217822164362739968',     // NewsEmoji[69] animated golden crown
  shield: '5197288647275071607',    // FinanceEmoji[51] animated blue check shield
  money: '5197434882321567830',     // FinanceEmoji[1] animated green $
  coin: '5199552030615558774',      // FinanceEmoji[12] animated gold coin
  pay: '5445353829304387411',       // FinanceEmoji[14] animated credit card
  credit: '5240228673738527951',    // FinanceEmoji[56] animated gold SALE tag
  orders: '5444856076954520455',    // FinanceEmoji[23] animated receipt
  invite: '5461151367559141950',    // NewsEmoji[99] animated party popper
  reward: '5278467510604160626',    // FinanceEmoji[59] animated golden treasure chest
  trophy: '5440539497383087970',    // NewsEmoji[89] animated #1 gold medal
  search: '5231012545799666522',    // NewsEmoji[50] animated magnifying glass
  lang: '5447410659077661506',      // NewsEmoji[13] animated globe
  support: '5443038326535759644',   // NewsEmoji[14] animated chat bubbles
  bell: '5458603043203327669',      // NewsEmoji[26] animated bell
  share: '5201691993775818138',     // FinanceEmoji[19] animated green paper plane
  affiliate: '5445221832074483553', // FinanceEmoji[46] animated briefcase
  user: '5332724926216428039',      // FinanceEmoji[28] animated connected users network
  chart: '5429651785352501917',     // FinanceEmoji[32] animated growth chart
  success: '5206607081334906820',   // NewsEmoji[23] animated green check
  cancel: '5210952531676504517',    // NewsEmoji[24] animated red cross
  pending: '5386367538735104399',   // NewsEmoji[79] animated loading spinner
  fire: '5456140674028019486',      // NewsEmoji[2] animated lightning bolt
  rocket: '5195033767969839232',    // FinanceEmoji[50] animated rocket
  details: '5334544901428229844',   // NewsEmoji[55] animated info badge
  guide: '5422439311196834318',     // NewsEmoji[88] animated lightbulb
  lock: '5296369303661067030',      // NewsEmoji[73] animated padlock
  unlock: '5406756500108501710',    // NewsEmoji[93] animated FREE badge
  key: '5325547803936572038',       // NewsEmoji[68] animated sparkles
  product: '5427168083074628963',   // NewsEmoji[66] animated diamond
};

const ROLE_CANDIDATES: Record<UiEmojiRole, string[]> = {
  store: ['💎', '🛍️', '🛍', '🏪', '✨'],
  shop: ['🛍️', '🛍', '🛒', '💎', '🏪'],
  cart: ['🛒', '🛍️', '🛍'],
  home: ['🏠', '🏡', '💎'],
  featured: ['⭐', '🌟', '🔥', '⚡'],
  crown: ['👑', '🏆', '⭐'],
  shield: ['🛡️', '🛡', '✅'],
  product: ['📦', '💎', '🔑', '⚡'],
  key: ['🔑', '✨', '🔐', '💎'],
  money: ['💰', '💵', '💸', '🪙'],
  coin: ['🪙', '💰', '💵'],
  pay: ['💳', '💵', '💰'],
  credit: ['🏷️', '🏷', '🎟', '🪙'],
  orders: ['🧾', '📦', '📋'],
  invite: ['🎉', '🎁', '👥'],
  reward: ['🎁', '🏆', '💰'],
  trophy: ['🥇', '🏆', '👑'],
  search: ['🔍', '🔎'],
  lang: ['🌐', '🌎'],
  support: ['💬', '❓'],
  bell: ['🔔', '📣'],
  share: ['🛫', '🔗', '📤'],
  affiliate: ['💼', '🤝', '📈'],
  chart: ['📈', '📊', '↗️'],
  success: ['✔️', '✅'],
  pending: ['⌛', '⏳'],
  fire: ['⚡️', '⚡', '🔥'],
  rocket: ['🚀', '🔥', '⚡'],
  guide: ['💡', '📖'],
  details: ['ℹ️', '📋'],
  back: ['⬅️', '◀️'],
  user: ['📇', '👥', '👤'],
  lock: ['🔒', '🔐'],
  unlock: ['🆓', '🔓', '🎉'],
  cancel: ['❌', '✖️'],
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

  /** Resolve custom_emoji_id: prefers visually verified animated IDs, else pack lookup. */
  resolveId(role: UiEmojiRole): string | null {
    const pinned = PINNED_ANIMATED_IDS[role];
    if (pinned) return pinned;
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
