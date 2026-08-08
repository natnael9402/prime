import { Module } from '@nestjs/common';
import { AffiliatesService } from './affiliates.service';
import { AffiliatesController } from './affiliates.controller';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  providers: [AffiliatesService],
  controllers: [AffiliatesController],
  exports: [AffiliatesService],
})
export class AffiliatesModule {}
