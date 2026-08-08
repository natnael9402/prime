import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('mine')
  async findMine(
    @Query('telegramUserId') telegramUserId?: string,
    @Query('email') email?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.findMine({
      telegramUserId,
      email,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }

  @Get('cart/:cartRef')
  async findByCart(@Param('cartRef') cartRef: string) {
    return this.ordersService.findByCart(cartRef);
  }

  @UseGuards(AdminGuard)
  @Get('admin/stats')
  async getAdminStats() {
    return this.ordersService.getAdminStats();
  }

  @UseGuards(AdminGuard)
  @Get('admin/list')
  async findAll(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.findAll(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':idOrTxRef')
  async findOne(@Param('idOrTxRef') idOrTxRef: string) {
    return this.ordersService.findOne(idOrTxRef);
  }
}
