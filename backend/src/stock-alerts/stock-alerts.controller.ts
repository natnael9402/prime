import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StockAlertsService } from './stock-alerts.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('stock-alerts')
export class StockAlertsController {
  constructor(private readonly stockAlerts: StockAlertsService) {}

  /** Public: subscribe to a back-in-stock alert. Tight limit — each sub pings Telegram. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async subscribe(
    @Body()
    body: {
      productId: string;
      telegramUserId: string;
      username?: string;
      firstName?: string;
    },
  ) {
    return this.stockAlerts.subscribe(body);
  }

  @UseGuards(AdminGuard)
  @Get('admin/list')
  async adminList() {
    return this.stockAlerts.adminList();
  }

  @UseGuards(AdminGuard)
  @Get('admin/product/:productId')
  async byProduct(@Param('productId') productId: string) {
    return this.stockAlerts.byProduct(productId);
  }
}
