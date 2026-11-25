import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { ProductsModule } from '../products/products.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { AffiliatesModule } from '../affiliates/affiliates.module';
import { StockAlertsModule } from '../stock-alerts/stock-alerts.module';
import { HomeCardsModule } from '../home-cards/home-cards.module';
import { RewardsModule } from '../rewards/rewards.module';
import { UsersModule } from '../users/users.module';
import { SupplierModule } from '../supplier/supplier.module';
import { BotStateService } from './bot-state.service';
import { BotI18nService } from './bot-i18n.service';
import { BotEmojiService } from './bot-emoji.service';
import { BotCheckoutService } from './bot-checkout.service';
import { BotRewardsService } from './bot-rewards.service';
import { BotMenuService } from './bot-menu.service';
import { BotUpdateRouter } from './bot-update.router';
import { BotController } from './bot.controller';

@Module({
  imports: [
    TelegramModule,
    ProductsModule,
    OrdersModule,
    PaymentsModule,
    AffiliatesModule,
    StockAlertsModule,
    HomeCardsModule,
    RewardsModule,
    UsersModule,
    SupplierModule,
  ],
  controllers: [BotController],
  providers: [
    BotStateService,
    BotI18nService,
    BotEmojiService,
    BotCheckoutService,
    BotRewardsService,
    BotMenuService,
    BotUpdateRouter,
  ],
  exports: [BotEmojiService],
})
export class BotModule {}
