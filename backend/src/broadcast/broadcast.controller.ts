import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { BroadcastService, SendBroadcastDto } from './broadcast.service';

@UseGuards(AdminGuard)
@Controller('broadcasts/admin')
export class BroadcastController {
  constructor(private readonly broadcast: BroadcastService) {}

  /** Ready-to-send campaign presets for the headline products. */
  @Get('presets')
  getPresets() {
    return this.broadcast.getPresets();
  }

  /** Recent broadcast reports, newest first. */
  @Get('list')
  list() {
    return this.broadcast.list();
  }

  /** Single report — used by the admin UI to poll live progress. */
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.broadcast.getOne(id);
  }

  /**
   * Queue a broadcast to every reachable Telegram user.
   * Returns the created report immediately; sending continues in background.
   */
  @Post('send')
  send(@Body() dto: SendBroadcastDto) {
    return this.broadcast.send(dto);
  }
}
