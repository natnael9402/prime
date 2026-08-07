import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

/**
 * Redis with a transparent in-memory fallback.
 * - REDIS_URL set  → real Redis (shared across replicas, survives restarts)
 * - REDIS_URL unset → process-local Map (single-instance dev; correct, just not shared)
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private memory = new Map<string, MemoryEntry>();
  private lastSweep = 0;

  constructor(private config: ConfigService) {
    const url = (this.config.get<string>('REDIS_URL') || '').trim();
    if (url) {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => Math.min(times * 500, 5000),
        lazyConnect: false,
      });
      this.client.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
      this.client.on('connect', () => this.logger.log('Redis connected'));
    }
  }

  get enabled(): boolean {
    return !!this.client && this.client.status === 'ready';
  }

  get mode(): 'redis' | 'memory' {
    return this.enabled ? 'redis' : 'memory';
  }

  /** Raw client for BullMQ — null when Redis is not configured. */
  get connection(): Redis | null {
    return this.client;
  }

  /**
   * Dedicated connection options for BullMQ. Workers need blocking commands,
   * which ioredis only allows with maxRetriesPerRequest: null — so BullMQ
   * gets its own connection instead of sharing the cache client.
   */
  get bullmqConnection(): Record<string, unknown> | null {
    const url = (this.config.get<string>('REDIS_URL') || '').trim();
    if (!url) return null;
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      username: u.username || undefined,
      password: u.password || undefined,
      db: u.pathname ? Number(u.pathname.slice(1)) || 0 : 0,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  async get(key: string): Promise<string | null> {
    if (this.enabled) {
      try {
        return await this.client!.get(key);
      } catch {
        return null;
      }
    }
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    if (this.enabled) {
      try {
        await this.client!.set(key, value, 'EX', ttlSec);
      } catch {}
      return;
    }
    this.sweepMemory();
    this.memory.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    if (this.enabled) {
      try {
        await this.client!.del(...keys);
      } catch {}
      return;
    }
    keys.forEach((k) => this.memory.delete(k));
  }

  /** Delete all keys starting with a prefix (cache invalidation). */
  async delPattern(prefix: string): Promise<void> {
    if (this.enabled) {
      try {
        let cursor = '0';
        do {
          const [next, keys] = await this.client!.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
          cursor = next;
          if (keys.length) await this.client!.del(...keys);
        } while (cursor !== '0');
      } catch {}
      return;
    }
    for (const key of this.memory.keys()) {
      if (key.startsWith(prefix)) this.memory.delete(key);
    }
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  private sweepMemory() {
    const now = Date.now();
    if (now - this.lastSweep < 30_000) return;
    this.lastSweep = now;
    for (const [k, e] of this.memory) {
      if (e.expiresAt < now) this.memory.delete(k);
    }
    // Hard cap so the fallback can never grow unbounded
    if (this.memory.size > 5000) this.memory.clear();
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit().catch(() => undefined);
  }
}
