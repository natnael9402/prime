import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProductsService, CreateProductDto } from './products.service';
import { TranslatableProductContent, TranslationService } from './translation.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly translationService: TranslationService,
  ) {}

  @Get()
  async findAll(@Query('category') category?: string, @Query('search') search?: string) {
    return this.productsService.findAll(category, search);
  }

  @UseGuards(AdminGuard)
  @Get('admin/all')
  async adminList() {
    return this.productsService.adminList();
  }

  @UseGuards(AdminGuard)
  @Get('translation/status')
  async translationStatus() {
    return this.translationService.status();
  }

  @UseGuards(AdminGuard)
  @Post('translate')
  async translate(@Body() body: TranslatableProductContent) {
    return this.translationService.translateProductContent(body);
  }

  @UseGuards(AdminGuard)
  @Put(':id/pricing')
  async updatePricing(
    @Param('id') id: string,
    @Body() body: { priceMode?: string; costUSD?: number; marginMultiplier?: number | null; discountPct?: number; manualPrice?: number },
  ) {
    return this.productsService.updatePricing(id, body);
  }

  @Get('categories')
  async getCategories() {
    return this.productsService.getCategories();
  }

  @UseGuards(AdminGuard)
  @Post('categories')
  async createCategory(@Body() body: { name: string; icon: string }) {
    return this.productsService.createCategory(body.name, body.icon);
  }

  @Get(':idOrSlug')
  async findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.productsService.findOne(idOrSlug);
  }

  @UseGuards(AdminGuard)
  @Post()
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @UseGuards(AdminGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateProductDto>) {
    return this.productsService.update(id, dto);
  }

  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
