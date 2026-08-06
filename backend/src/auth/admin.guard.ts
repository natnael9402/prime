import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Admin session token: base64url(payload).hmacSHA256(JWT_SECRET).
 * Self-contained verification — no DB lookup, no extra deps.
 */
export function signAdminToken(email: string, secret: string, ttlMs = 12 * 3600 * 1000): string {
  const payload = Buffer.from(
    JSON.stringify({ role: 'admin', email, exp: Date.now() + ttlMs }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token: string, secret: string): { email: string } | null {
  const [payload, sig] = (token || '').split('.');
  if (!payload || !sig || !secret) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data?.role !== 'admin' || !data?.email || typeof data.exp !== 'number') return null;
    if (data.exp < Date.now()) return null;
    return { email: String(data.email) };
  } catch {
    return null;
  }
}

/** Guard for admin-only API routes. Requires: Authorization: Bearer <admin token>. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    const secret = this.config.get<string>('JWT_SECRET') || '';
    const admin = verifyAdminToken(token, secret);
    if (!admin) throw new UnauthorizedException('Admin login required');
    req.admin = admin;
    return true;
  }
}
