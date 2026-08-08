import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class StockAlertsService {
  private readonly logger = new Logger(StockAlertsService.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  /** Public: subscribe a Telegram user to a back-in-stock alert for a product. */
  async subscribe(dto: {
    productId: string;
    telegramUserId: string;
    username?: string;
    firstName?: string;
  }) {
    const telegramUserId = String(dto.telegramUserId || '').trim();
    if (!telegramUserId || !/^\d+$/.test(telegramUserId)) {
      throw new BadRequestException('Telegram account required');
    }

    const product = await this.prisma.product.findFirst({
      where: { OR: [{ id: dto.productId }, { slug: dto.productId }] },
      select: { id: true, stock: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const alert = await this.prisma.stockAlert.upsert({
      where: {
        productId_telegramUserId: { productId: product.id, telegramUserId },
      },
      create: {
        productId: product.id,
        telegramUserId,
        username: dto.username || null,
        firstName: dto.firstName || null,
      },
      update: {},
    });
    return { subscribed: true, id: alert.id };
  }

  /** Admin: everyone waiting on a restock, newest first. */
  async adminList() {
    return this.prisma.stockAlert.findMany({
      include: {
        product: {
          select: { id: true, name: true, bannerUrl: true, stock: true, price: true, currency: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin: subscribers of a single product. */
  async byProduct(productId: string) {
    return this.prisma.stockAlert.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Called when a product's stock goes 0 → >0. Sends a Telegram message to
   * every subscriber, then clears the alerts (one-shot notifications).
   */
  async notifyRestock(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, slug: true, name: true, price: true, currency: true, stock: true },
    });
    if (!product || product.stock <= 0) return { notified: 0 };

    const alerts = await this.prisma.stockAlert.findMany({ where: { productId: product.id } });
    if (alerts.length === 0) return { notified: 0 };

    const productPath = `/product/${product.slug || product.id}`;
    let notified = 0;
    for (const a of alerts) {
      try {
        const res = await this.telegram.notifyBackInStock({
          telegramUserId: a.telegramUserId,
          productName: product.name,
          price: product.price,
          currency: product.currency,
          productPath,
        });
        if (res !== null) notified++;
      } catch (err: any) {
        this.logger.warn(`restock notify failed for ${a.telegramUserId}: ${err?.message}`);
      }
    }

    await this.prisma.stockAlert.deleteMany({ where: { productId: product.id } });
    this.logger.log(`Restock notify: ${product.name} → ${notified}/${alerts.length} subscribers`);
    return { notified };
  }
}
