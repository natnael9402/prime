import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { UsersService } from './users.service';

@UseGuards(AdminGuard)
@Controller('users/admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('list')
  list(
    @Query('search') search?: string,
    @Query('filter') filter?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
  ) {
    return this.users.listUsers({
      search,
      filter,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
      sort,
    });
  }

  @Get(':telegramId')
  detail(@Param('telegramId') telegramId: string) {
    return this.users.getUserDetail(telegramId);
  }

  @Put(':telegramId')
  update(
    @Param('telegramId') telegramId: string,
    @Body()
    body: {
      isBanned?: boolean;
      banReason?: string | null;
      adminNote?: string | null;
      customDiscountPct?: number;
      storeCredit?: number;
      languageCode?: string;
    },
  ) {
    return this.users.updateUser(telegramId, body);
  }

  @Post(':telegramId/credit')
  adjustCredit(
    @Param('telegramId') telegramId: string,
    @Body() body: { delta: number; reason?: string; notify?: boolean },
  ) {
    return this.users.adjustCredit(telegramId, body);
  }

  @Post(':telegramId/message')
  sendMessage(@Param('telegramId') telegramId: string, @Body() body: { text: string }) {
    return this.users.sendDirectMessage(telegramId, body.text);
  }
}
