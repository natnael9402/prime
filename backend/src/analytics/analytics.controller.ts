import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AnalyticsService } from './analytics.service';

@UseGuards(AdminGuard)
@Controller('analytics/admin')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  dashboard(@Query('range') range?: string) {
    return this.analytics.getDashboard(range);
  }
}
