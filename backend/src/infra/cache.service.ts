import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

/** Cache-aside helper: read-through JSON cache with TTL. */
@Injectable()
export class CacheService {
  constructor(private redis: RedisService) {}

  async wrap<T>(key: string, ttlSec: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached !== null) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        // corrupted entry → fall through and reload
      }
    }
    const fresh = await loader();
    // Never cache null/undefined — a failed lookup must not poison the cache
    if (fresh !== null && fresh !== undefined) {
      await this.redis.set(key, JSON.stringify(fresh), ttlSec);
    }
    return fresh;
  }

  async invalidatePattern(prefix: string) {
    await this.redis.delPattern(prefix);
  }

  async invalidate(...keys: string[]) {
    await this.redis.del(...keys);
  }
}
