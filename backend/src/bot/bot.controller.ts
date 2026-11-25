import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { TelegramService } from '../telegram/telegram.service';
import { BotEmojiService } from './bot-emoji.service';

@Controller('bot')
export class BotController {
  constructor(
    private readonly emojiService: BotEmojiService,
    private readonly telegram: TelegramService,
  ) {}

  @UseGuards(AdminGuard)
  @Get('admin/emoji-pack')
  async getEmojiPack(@Query('name') name?: string) {
    return this.emojiService.getPack(name);
  }

  /**
   * Read-only proxy for Telegram sticker/emoji thumbnails so the Web Admin
   * can preview HubX custom emojis without exposing TELEGRAM_BOT_TOKEN.
   */
  @Get('emoji-file/:fileId')
  async proxyEmojiFile(@Param('fileId') fileId: string, @Res() res: Response) {
    if (!/^[A-Za-z0-9_-]{10,140}$/.test(fileId)) {
      throw new BadRequestException('Invalid fileId');
    }
    const file = await this.telegram.getFileBuffer(fileId);
    if (!file) throw new NotFoundException('File not found');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(file.buffer);
  }
}
