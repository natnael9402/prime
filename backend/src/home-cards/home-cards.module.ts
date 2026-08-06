import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HomeCardsController } from './home-cards.controller';
import { HomeCardsService } from './home-cards.service';

@Module({
  imports: [PrismaModule],
  controllers: [HomeCardsController],
  providers: [HomeCardsService],
})
export class HomeCardsModule {}
