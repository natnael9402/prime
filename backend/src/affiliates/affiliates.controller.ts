import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AffiliatesService } from './affiliates.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('affiliates')
export class AffiliatesController {
  constructor(private readonly affiliates: AffiliatesService) {}

  @Post('join')
  async join(
    @Body()
    body: {
      name: string;
      phone?: string;
      email?: string;
      telegramUserId?: string;
      telegramUsername?: string;
      payoutMethod?: string;
      payoutAccount?: string;
    },
  ) {
    return this.affiliates.join(body);
  }

  @Get('stats/:code')
  async stats(@Param('code') code: string) {
    return this.affiliates.getStats(code);
  }

  @Post('click/:code')
  async click(@Param('code') code: string) {
    return this.affiliates.trackClick(code);
  }

  /** Public: Telegram deep link for sharing (optionally product-specific). */
  @Get('share-link')
  async shareLink(@Query('code') code: string, @Query('productId') productId?: string) {
    return { link: await this.affiliates.referralLink(code, productId) };
  }

  /** Public: affiliate requests a payout (Telebirr phone or CBE account). */
  @Post('payout')
  async requestPayout(@Body() body: { code: string; method: string; account: string }) {
    return this.affiliates.requestPayout(body);
  }

  // ---------- Admin ----------
  @UseGuards(AdminGuard)
  @Get('admin/list')
  async adminList() {
    return this.affiliates.adminList();
  }

  @UseGuards(AdminGuard)
  @Get('admin/payouts')
  async adminPayouts(@Query('status') status?: string) {
    return this.affiliates.adminPayouts(status);
  }

  @UseGuards(AdminGuard)
  @Post('admin/payouts/:id/pay')
  async payPayout(@Param('id') id: string) {
    return this.affiliates.markPayoutPaid(id);
  }

  @UseGuards(AdminGuard)
  @Post('admin/payouts/:id/reject')
  async rejectPayout(@Param('id') id: string) {
    return this.affiliates.rejectPayout(id);
  }

  @UseGuards(AdminGuard)
  @Get('admin/commissions')
  async adminCommissions(@Query('status') status?: string) {
    return this.affiliates.adminCommissions(status);
  }

  @UseGuards(AdminGuard)
  @Post('admin/commissions/:id/pay')
  async payCommission(@Param('id') id: string) {
    return this.affiliates.markCommissionPaid(id);
  }

  @UseGuards(AdminGuard)
  @Post('admin/commissions/:id/cancel')
  async cancelCommission(@Param('id') id: string) {
    return this.affiliates.cancelCommission(id);
  }

  @UseGuards(AdminGuard)
  @Put('admin/:id')
  async updateAffiliate(
    @Param('id') id: string,
    @Body() body: { status?: string; commissionRate?: number; payoutMethod?: string; payoutAccount?: string },
  ) {
    return this.affiliates.updateAffiliate(id, body);
  }
}
