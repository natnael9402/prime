import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { signAdminToken } from './admin.guard';

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
const MAX_INITDATA_AGE_SEC = 7 * 24 * 3600; // accept initData up to 7 days old

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  /* ---------------- Admin (email + password) ---------------- */

  /** scrypt verify — format: scrypt$N$r$p$salt_b64$hash_b64 (timing-safe). */
  private verifyPassword(password: string, stored: string): boolean {
    try {
      const parts = stored.split('$');
      if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
      const [, N, r, p, saltB64, hashB64] = parts;
      const salt = Buffer.from(saltB64, 'base64');
      const expected = Buffer.from(hashB64, 'base64');
      const actual = crypto.scryptSync(password, salt, expected.length, {
        N: Number(N),
        r: Number(r),
        p: Number(p),
      });
      return crypto.timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  async adminLogin(email: string, password: string) {
    const normalized = (email || '').trim().toLowerCase();
    const user = normalized
      ? await this.prisma.adminUser.findUnique({ where: { email: normalized } })
      : null;
    // Uniform failure — never reveal whether the email exists
    if (!user || !this.verifyPassword(password || '', user.passwordHash)) {
      throw new UnauthorizedException({ ok: false, reason: 'invalid_credentials' });
    }
    const secret = this.config.get<string>('JWT_SECRET') || '';
    return {
      ok: true,
      token: signAdminToken(user.email, secret),
      user: { email: user.email, name: user.name },
    };
  }

  private get botToken(): string {
    const t = (this.config.get<string>('TELEGRAM_BOT_TOKEN') || '').trim();
    return t && !t.startsWith('mock') && t.length > 20 ? t : '';
  }

  get configured(): boolean {
    return !!this.botToken;
  }

  /**
   * Verify Telegram Mini App initData per
   * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
   */
  private verifyInitData(initData: string, botToken: string): { user: any; authDate: number } | null {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(initData);
    } catch {
      return null;
    }
    const hash = params.get('hash') || '';
    if (!hash) return null;
    params.delete('hash');

    const pairs: string[] = [];
    params.forEach((value, key) => pairs.push(`${key}=${value}`));
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const a = Buffer.from(computed, 'utf8');
    const b = Buffer.from(hash, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const authDate = Number(params.get('auth_date') || 0);
    if (!authDate || Math.abs(Date.now() / 1000 - authDate) > MAX_INITDATA_AGE_SEC) return null;

    const userStr = params.get('user');
    if (!userStr) return null;
    try {
      const user = JSON.parse(userStr);
      if (!user?.id) return null;
      return { user, authDate };
    } catch {
      return null;
    }
  }

  /** Lightweight signed session: base64url(payload).hmac — verifiable without DB lookup. */
  private signSession(telegramId: string): string {
    const payload = Buffer.from(
      JSON.stringify({ tid: telegramId, exp: Date.now() + SESSION_TTL_MS }),
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', this.botToken).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  verifySession(token: string): string | null {
    const [payload, sig] = (token || '').split('.');
    if (!payload || !sig || !this.configured) return null;
    const expected = crypto.createHmac('sha256', this.botToken).update(payload).digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!data?.tid || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
      return String(data.tid);
    } catch {
      return null;
    }
  }

  async loginWithTelegram(initData: string) {
    if (!this.configured) {
      throw new ServiceUnavailableException({
        verified: false,
        reason: 'bot_not_configured',
        message: 'Set a real TELEGRAM_BOT_TOKEN in backend/.env to enable Telegram sign-in.',
      });
    }
    if (!initData || typeof initData !== 'string') {
      throw new UnauthorizedException({ verified: false, reason: 'missing_init_data' });
    }

    const result = this.verifyInitData(initData, this.botToken);
    if (!result) {
      throw new UnauthorizedException({ verified: false, reason: 'invalid_init_data' });
    }

    const u = result.user;
    const telegramId = String(u.id);
    const record = await this.prisma.tgUser.upsert({
      where: { telegramId },
      create: {
        telegramId,
        firstName: u.first_name || null,
        lastName: u.last_name || null,
        username: u.username || null,
        photoUrl: u.photo_url || null,
        languageCode: u.language_code || null,
      },
      update: {
        firstName: u.first_name || null,
        lastName: u.last_name || null,
        username: u.username || null,
        photoUrl: u.photo_url || null,
        languageCode: u.language_code || null,
      },
    });

    return {
      verified: true,
      token: this.signSession(telegramId),
      user: {
        telegramId,
        firstName: record.firstName,
        lastName: record.lastName,
        username: record.username,
        photoUrl: record.photoUrl,
      },
    };
  }

  async getMe(token: string) {
    const telegramId = this.verifySession(token);
    if (!telegramId) {
      throw new UnauthorizedException({ verified: false, reason: 'invalid_session' });
    }
    const record = await this.prisma.tgUser.findUnique({ where: { telegramId } });
    if (!record) {
      throw new UnauthorizedException({ verified: false, reason: 'user_not_found' });
    }
    return {
      verified: true,
      user: {
        telegramId,
        firstName: record.firstName,
        lastName: record.lastName,
        username: record.username,
        photoUrl: record.photoUrl,
      },
    };
  }
}
