import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SupplierService } from './supplier.service';
import { AdminGuard } from '../auth/admin.guard';

@UseGuards(AdminGuard)
@Controller('supplier')
export class SupplierController {
  constructor(private readonly supplier: SupplierService) {}

  @Get('status')
  async status() {
    return this.supplier.status();
  }

  @Get('products')
  async products() {
    return this.supplier.listProducts();
  }

  @Post('import')
  async import(
    @Body()
    body: {
      supplierProductId: string;
      categoryId: string;
      name?: string;
      shortDesc?: string;
      description?: string;
      bannerUrl?: string;
      gallery?: string[];
      marginMultiplier?: number;
      discountPct?: number;
      manualPrice?: number;
      originalPrice?: number;
      badge?: string;
      features?: string[];
      requirements?: string[];
      activationSteps?: string[];
      translations?: any;
    },
  ) {
    return this.supplier.importProduct(body);
  }

  @Post('sync-stock')
  async syncStock() {
    return this.supplier.syncStock();
  }
}
