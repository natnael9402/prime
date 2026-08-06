import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { FulfillmentQueue } from './fulfillment.queue';
import { LicensesModule } from '../licenses/licenses.module';
import { AffiliatesModule } from '../affiliates/affiliates.module';
import { TelegramModule } from '../telegram/telegram.module';
import { SupplierModule } from '../supplier/supplier.module';

@Module({
  imports: [LicensesModule, AffiliatesModule, TelegramModule, SupplierModule],
  providers: [PaymentsService, FulfillmentQueue],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
