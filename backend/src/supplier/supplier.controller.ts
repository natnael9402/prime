import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { SupplierService, ImportProductDto } from './supplier.service';
import { AdminGuard } from '../auth/admin.guard';

@UseGuards(AdminGuard)
@Controller('supplier')
export class SupplierController {
  constructor(private readonly supplier: SupplierService) {}

  /** The switcher: all known suppliers + whether their key is configured. */
  @Get('list')
  async list() {
    return this.supplier.listSuppliers();
  }

  @Get('status')
  async status(@Query('supplier') supplier?: string) {
    return this.supplier.status(supplier);
  }

  @Get('products')
  async products(@Query('supplier') supplier?: string) {
    return this.supplier.listProducts(supplier);
  }

  @Post('import')
  async import(@Body() body: ImportProductDto) {
    return this.supplier.importProduct(body);
  }

  @Post('sync-stock')
  async syncStock(@Body() body?: { supplier?: string }) {
    return this.supplier.syncStock(body?.supplier);
  }
}
