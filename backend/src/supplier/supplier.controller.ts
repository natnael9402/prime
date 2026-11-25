import { Body, Controller, Get, Headers, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SupplierService, ImportProductDto } from './supplier.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('supplier')
export class SupplierController {
  constructor(private readonly supplier: SupplierService) {}

  /** The switcher: all known suppliers + whether their key is configured. */
  @UseGuards(AdminGuard)
  @Get('list')
  async list() {
    return this.supplier.listSuppliers();
  }

  @UseGuards(AdminGuard)
  @Get('status')
  async status(@Query('supplier') supplier?: string) {
    return this.supplier.status(supplier);
  }

  @UseGuards(AdminGuard)
  @Get('products')
  async products(@Query('supplier') supplier?: string) {
    return this.supplier.listProducts(supplier);
  }

  @UseGuards(AdminGuard)
  @Post('import')
  async import(@Body() body: ImportProductDto) {
    return this.supplier.importProduct(body);
  }

  @UseGuards(AdminGuard)
  @Post('sync-stock')
  async syncStock(@Body() body?: { supplier?: string }) {
    return this.supplier.syncStock(body?.supplier);
  }

  /** Optional signed webhook receiver for DanteHub async delivery events. */
  @SkipThrottle()
  @Post('dantehub/webhook')
  async dantehubWebhook(
    @Body() payload: any,
    @Req() req: any,
    @Headers('x-dantehub-signature') signature?: string,
  ) {
    const raw = req?.rawBody || JSON.stringify(payload || {});
    return this.supplier.handleDanteHubWebhook(payload, raw, signature);
  }
}
