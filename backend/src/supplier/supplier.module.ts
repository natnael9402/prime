import { Module } from '@nestjs/common';
import { SupplierService } from './supplier.service';
import { SupplierController } from './supplier.controller';
import { SettingsModule } from '../settings/settings.module';
import { StockAlertsModule } from '../stock-alerts/stock-alerts.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [SettingsModule, StockAlertsModule, TelegramModule],
  providers: [SupplierService],
  controllers: [SupplierController],
  exports: [SupplierService],
})
export class SupplierModule {}
