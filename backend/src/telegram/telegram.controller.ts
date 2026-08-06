import { Controller, Post, Body } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Post('webhook')
  async webhook(@Body() update: any) {
    if (update) {
      await this.telegram.handleUpdate(update);
    }
    return { ok: true };
  }
}
