import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { RewardsService } from './rewards.service';

@UseGuards(AdminGuard)
@Controller('rewards/admin')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get('stats')
  stats() {
    return this.rewards.adminStats();
  }

  @Get('tiers')
  listTiers() {
    return this.rewards.adminListTiers();
  }

  @Post('tiers')
  createTier(
    @Body()
    body: {
      title: string;
      description?: string;
      requiredInvites: number;
      rewardType: string;
      productId?: string | null;
      creditAmount?: number | null;
      autoDeliver?: boolean;
      enabled?: boolean;
    },
  ) {
    return this.rewards.createTier(body);
  }

  @Put('tiers/:id')
  updateTier(@Param('id') id: string, @Body() body: any) {
    return this.rewards.updateTier(id, body);
  }

  @Delete('tiers/:id')
  deleteTier(@Param('id') id: string) {
    return this.rewards.deleteTier(id);
  }

  @Get('claims')
  listClaims(@Query('status') status?: string) {
    return this.rewards.adminListClaims(status);
  }

  @Post('claims/:id/approve')
  approveClaim(@Param('id') id: string) {
    return this.rewards.approveClaim(id);
  }

  @Post('claims/:id/reject')
  rejectClaim(@Param('id') id: string) {
    return this.rewards.rejectClaim(id);
  }
}
