import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AdminGuard } from '../auth/admin.guard';

@UseGuards(AdminGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get() {
    return this.settings.getAll();
  }

  @Put()
  async update(@Body() body: { usdToEtb?: number; marginMultiplier?: number; globalDiscountPct?: number }) {
    return this.settings.update({
      usdToEtb: body.usdToEtb !== undefined ? Number(body.usdToEtb) : undefined,
      marginMultiplier: body.marginMultiplier !== undefined ? Number(body.marginMultiplier) : undefined,
      globalDiscountPct: body.globalDiscountPct !== undefined ? Number(body.globalDiscountPct) : undefined,
    });
  }
}
