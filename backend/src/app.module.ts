import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { InfraModule } from './infra/infra.module';
import { ProductsModule } from './products/products.module';
import { LicensesModule } from './licenses/licenses.module';
import { PaymentsModule } from './payments/payments.module';
import { OrdersModule } from './orders/orders.module';
import { AffiliatesModule } from './affiliates/affiliates.module';
import { TelegramModule } from './telegram/telegram.module';
import { StockAlertsModule } from './stock-alerts/stock-alerts.module';
import { SettingsModule } from './settings/settings.module';
import { SupplierModule } from './supplier/supplier.module';
import { AuthModule } from './auth/auth.module';
import { HomeCardsModule } from './home-cards/home-cards.module';
import { R2Module } from './r2/r2.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global abuse guard: 300 req/min per IP. Stricter limits live on
    // payment endpoints via @Throttle. Payment webhooks are skipped.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    InfraModule,
    ProductsModule,
    LicensesModule,
    PaymentsModule,
    OrdersModule,
    AffiliatesModule,
    TelegramModule,
    StockAlertsModule,
    SettingsModule,
    SupplierModule,
    AuthModule,
    HomeCardsModule,
    R2Module,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
