import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { TranslationService } from './translation.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [ProductsController],
  providers: [ProductsService, TranslationService],
  exports: [ProductsService, TranslationService],
})
export class ProductsModule {}
