import { Module } from '@nestjs/common';
import { LicensesService } from './licenses.service';
import { LicensesController } from './licenses.controller';
import { StockAlertsModule } from '../stock-alerts/stock-alerts.module';

@Module({
  imports: [StockAlertsModule],
  providers: [LicensesService],
  controllers: [LicensesController],
  exports: [LicensesService],
})
export class LicensesModule {}
