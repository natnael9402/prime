import { Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AdminGuard } from './admin.guard';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /** Public: lets the frontend know whether Telegram sign-in is live. */
  @Get('status')
  status() {
    return { telegramAuth: this.auth.configured };
  }

  /** Admin sign-in — strictly rate-limited against brute force. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('admin/login')
  adminLogin(@Body() body: { email?: string; password?: string }) {
    return this.auth.adminLogin(body?.email || '', body?.password || '');
  }

  /** Admin session check. */
  @UseGuards(AdminGuard)
  @Get('admin/me')
  adminMe(@Req() req: any) {
    return { ok: true, user: req.admin };
  }

  /** Verify Mini App initData, auto-create the account, return a session. */
  @Post('telegram')
  login(@Body() body: { initData?: string }) {
    return this.auth.loginWithTelegram(body?.initData || '');
  }

  /** Return the session user (Bearer token from /auth/telegram). */
  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    const token = (authorization || '').replace(/^Bearer\s+/i, '');
    return this.auth.getMe(token);
  }
}
