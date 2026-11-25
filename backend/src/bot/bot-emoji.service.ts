import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from '../telegram/telegram.service';
import { RedisService } from '../infra/redis.service';

export interface EmojiPackItem {
  customEmojiId: string;
  emoji: string;
  fileId: string;
  thumbFileId: string | null;
  isAnimated: boolean;
  isVideo: boolean;
}

@Injectable()
export class BotEmojiService {
  constructor(
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  get defaultPackName(): string {
    return (this.config.get<string>('TELEGRAM_EMOJI_PACK') || 'hubxemoji').trim();
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

    await this.redis.set(cacheKey, JSON.stringify(payload), 900);
    return payload;
  }
}
