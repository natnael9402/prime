import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TelegramModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
