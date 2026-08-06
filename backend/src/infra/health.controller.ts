import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from './redis.service';

/**
 * /health  — liveness: process is up (cheap, for load balancers)
 * /health/ready — readiness: DB reachable (for deploy gating / k8s)
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get()
  liveness() {
    return {
      status: 'ok',
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async readiness() {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {}

    const redisConfigured = !!this.redis.connection;
    const redisUp = redisConfigured ? await this.redis.ping() : null;

    if (!db) {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
    return {
      status: 'ok',
      db: 'up',
      redis: redisConfigured ? (redisUp ? 'up' : 'down') : 'disabled',
      cacheMode: this.redis.mode,
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
    };
  }
}
