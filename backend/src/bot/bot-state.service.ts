import { Injectable } from '@nestjs/common';
import { RedisService } from '../infra/redis.service';

export type BotInputStep = 'SEARCH' | 'AFF_PAYOUT_ACCOUNT' | null;

export interface BotUserState {
  pendingRef?: string | null;
  inputStep?: BotInputStep;
  payoutMethod?: 'telebirr' | 'cbe' | null;
  lastProductId?: string | null;
  lastCategorySlug?: string | null;
}

const STATE_TTL_SEC = 7 * 24 * 3600;
const DEFAULT_STATE: BotUserState = {
  pendingRef: null,
  inputStep: null,
  payoutMethod: null,
  lastProductId: null,
  lastCategorySlug: 'all',
};

@Injectable()
export class BotStateService {
  constructor(private readonly redis: RedisService) {}

  private key(telegramId: string | number) {
    return `bot:state:${telegramId}`;
  }

  async getState(telegramId: string | number): Promise<BotUserState> {
    const raw = await this.redis.get(this.key(telegramId));
    if (!raw) return { ...DEFAULT_STATE };
    try {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...parsed };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  async setState(telegramId: string | number, patch: Partial<BotUserState>): Promise<BotUserState> {
    const current = await this.getState(telegramId);
    const next: BotUserState = { ...current, ...patch };
    await this.redis.set(this.key(telegramId), JSON.stringify(next), STATE_TTL_SEC);
    return next;
  }
}
