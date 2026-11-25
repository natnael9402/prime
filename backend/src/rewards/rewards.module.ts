import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { LicensesModule } from '../licenses/licenses.module';
import { SupplierModule } from '../supplier/supplier.module';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';

@Module({
  imports: [TelegramModule, LicensesModule, SupplierModule],
  providers: [RewardsService],
  controllers: [RewardsController],
  exports: [RewardsService],
})
export class RewardsModule {}
