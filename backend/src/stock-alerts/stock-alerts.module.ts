import { Module } from '@nestjs/common';
import { StockAlertsService } from './stock-alerts.service';
import { StockAlertsController } from './stock-alerts.controller';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  providers: [StockAlertsService],
  controllers: [StockAlertsController],
  exports: [StockAlertsService],
})
export class StockAlertsModule {}
