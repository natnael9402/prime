import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockAlertsService } from '../stock-alerts/stock-alerts.service';

@Injectable()
export class LicensesService {
  constructor(
    private prisma: PrismaService,
    private stockAlerts: StockAlertsService,
  ) {}

  async addKeys(productId: string, keys: string[]) {
    const cleanKeys = keys.map(k => k.trim()).filter(k => k.length > 0);
    const data = cleanKeys.map(code => ({
      productId,
      code,
      isUsed: false,
    }));

    const before = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { stock: true },
    });

    await this.prisma.licenseKey.createMany({ data });

    const availableCount = await this.prisma.licenseKey.count({
      where: { productId, isUsed: false },
    });

    await this.prisma.product.update({
      where: { id: productId },
      data: { stock: availableCount },
    });

    // Restock 0 → >0: ping everyone waiting on this product
    if ((before?.stock ?? 0) <= 0 && availableCount > 0) {
      this.stockAlerts.notifyRestock(productId).catch(() => undefined);
    }

    return { added: cleanKeys.length, totalAvailable: availableCount };
  }

  async allocateKeyForOrder(productId: string, orderId: string, quantity = 1): Promise<string> {
    const keys = await this.prisma.licenseKey.findMany({
      where: { productId, isUsed: false },
      take: quantity,
    });

    const codes: string[] = [];

    if (keys.length > 0) {
      await this.prisma.licenseKey.updateMany({
        where: { id: { in: keys.map((k) => k.id) } },
        data: { isUsed: true, orderId },
      });
      codes.push(...keys.map((k) => k.code));
    }

    // Top up with generated keys when the pool is short
    const missing = quantity - codes.length;
    for (let i = 0; i < missing; i++) {
      codes.push(
        `KEY-GEN-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase()}`,
      );
    }

    const remainingStock = await this.prisma.licenseKey.count({
      where: { productId, isUsed: false },
    });

    await this.prisma.product.update({
      where: { id: productId },
      data: { stock: remainingStock },
    });

    return codes.join('\n');
  }

  async getKeysByProduct(productId: string) {
    return this.prisma.licenseKey.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
