import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { HomeCardsService, HomeCardInput } from './home-cards.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('home-cards')
export class HomeCardsController {
  constructor(private readonly homeCards: HomeCardsService) {}

  /** Storefront */
  @Get()
  async listPublic() {
    return this.homeCards.listPublic();
  }

  /** Admin */
  @UseGuards(AdminGuard)
  @Get('admin')
  async listAdmin() {
    return this.homeCards.listAdmin();
  }

  @UseGuards(AdminGuard)
  @Post()
  async create(@Body() body: HomeCardInput) {
    return this.homeCards.create(body);
  }

  @UseGuards(AdminGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: HomeCardInput) {
    return this.homeCards.update(id, body);
  }

  @UseGuards(AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.homeCards.remove(id);
  }
}
