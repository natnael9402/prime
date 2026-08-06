import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { LicensesService } from './licenses.service';

@Controller('licenses')
export class LicensesController {
  constructor(private readonly licenses: LicensesService) {}

  @Get(':productId/keys')
  async getKeys(@Param('productId') productId: string) {
    return this.licenses.getKeysByProduct(productId);
  }

  @Post(':productId/keys')
  async addKeys(@Param('productId') productId: string, @Body() body: { keys: string[] }) {
    return this.licenses.addKeys(productId, body.keys || []);
  }
}
