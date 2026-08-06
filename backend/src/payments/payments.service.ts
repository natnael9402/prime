import { Injectable, BadRequestException, NotFoundException, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LicensesService } from '../licenses/licenses.service';
import { AffiliatesService } from '../affiliates/affiliates.service';
import { TelegramService } from '../telegram/telegram.service';
import { SupplierService } from '../supplier/supplier.service';
import { FulfillmentQueue } from './fulfillment.queue';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface CustomerInput {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  telegramUserId?: string;
  telegramUsername?: string;
  refCode?: string;
}

interface CartLine {
  productId: string;
  quantity: number;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private licensesService: LicensesService,
    private affiliatesService: AffiliatesService,
    private telegramService: TelegramService,
    private supplierService: SupplierService,
    @Inject(forwardRef(() => FulfillmentQueue))
    private fulfillmentQueue: FulfillmentQueue,
  ) {}

  getMode(): { mode: 'mock' | 'live'; testMode: boolean } {
    const envMode = (this.configService.get<string>('PAYMENT_MODE') || 'auto').toLowerCase();
    const key = this.configService.get<string>('CHAPA_SECRET_KEY') || '';
    const keyLooksValid =
      key.startsWith('CHASECK') && !key.toLowerCase().includes('mock') && key.length > 20;

    if (envMode === 'mock') return { mode: 'mock', testMode: true };
    if (envMode === 'live') return { mode: 'live', testMode: key.includes('TEST') };
    if (keyLooksValid) return { mode: 'live', testMode: key.includes('TEST') };
    return { mode: 'mock', testMode: true };
  }

  private frontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  /** Identity comes from Telegram; email is optional (Chapa's hosted page collects it). */
  private validateCustomer(data: CustomerInput) {
    if (data.customerEmail && !EMAIL_RE.test(data.customerEmail.trim())) {
      throw new BadRequestException('ትክክለኛ ኢሜይል ያስገቡ (Invalid email format)');
    }
  }

  /** Create a Chapa hosted checkout — mirrors the proven career-lyft payload shape. */
  private async chapaInitialize(params: {
    txRef: string;
    amount: number;
    title: string;
    description: string;
    data: CustomerInput;
    returnUrl: string;
  }): Promise<{ checkoutUrl?: string; error?: string }> {
    const secretKey = this.configService.get<string>('CHAPA_SECRET_KEY');
    const backendPublic =
      this.configService.get<string>('BACKEND_PUBLIC_URL') || 'http://localhost:5000';

    const names = (params.data.customerName || params.data.telegramUsername || '').trim().split(/\s+/);
    const firstName = names[0] || 'Customer';
    const lastName = names.slice(1).join(' ') || 'User';
    const email = (params.data.customerEmail || '').trim();

    try {
      const response = await axios.post(
        'https://api.chapa.co/v1/transaction/initialize',
        {
          amount: params.amount,
          currency: 'ETB',
          ...(email ? { email } : {}),
          first_name: firstName,
          last_name: lastName,
          title: params.title.substring(0, 30),
          description: params.description.substring(0, 120),
          tx_ref: params.txRef,
          callback_url: `${backendPublic}/payments/webhook`,
          return_url: params.returnUrl,
        },
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );

      if (response.data?.status === 'success' && response.data.data?.checkout_url) {
        return { checkoutUrl: response.data.data.checkout_url };
      }
      return { error: response.data?.message || 'Chapa did not return a checkout URL' };
    } catch (error: any) {
      const msg =
        typeof error?.response?.data?.message === 'string'
          ? error.response.data.message
          : JSON.stringify(error?.response?.data?.message || error?.message || 'Chapa connection failed');
      this.logger.error(`Chapa init failed: ${msg}`);
      return { error: msg };
    }
  }

  /** Single-product purchase (kept for the product page "buy now" flow). */
  async initializePayment(data: CustomerInput & { productId: string; quantity?: number }) {
    return this.initializeCart({ ...data, items: [{ productId: data.productId, quantity: data.quantity || 1 }] });
  }

  /** Multi-item cart checkout — one payment, many order lines. */
  async initializeCart(data: CustomerInput & { items: CartLine[] }) {
    this.validateCustomer(data);

    if (!data.items?.length) {
      throw new BadRequestException('Cart is empty');
    }

    const affiliate = await this.affiliatesService.resolveRefCode(data.refCode);
    const { mode } = this.getMode();

    // Validate lines & compute totals
    const lines: { product: any; quantity: number; lineTotal: number }[] = [];
    for (const item of data.items) {
      const qty = Math.max(1, Math.min(50, Math.floor(item.quantity || 1)));
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new BadRequestException(`Product not found`);
      if (product.stock <= 0) throw new BadRequestException(`"${product.name}" አልቋል (Out of stock)`);
      if (product.source !== 'HUBX' && product.stock < qty) {
        throw new BadRequestException(`"${product.name}" ${product.stock} ብቻ ነው ያለው (Only ${product.stock} left)`);
      }
      lines.push({ product, quantity: qty, lineTotal: product.price * qty });
    }

    const totalAmount = lines.reduce((s, l) => s + l.lineTotal, 0);
    const cartRef = `KVC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, '0')}`;

    const createdOrders: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const order = await this.prisma.order.create({
        data: {
          txRef: `${cartRef}-L${i + 1}`,
          cartRef,
          productId: line.product.id,
          quantity: line.quantity,
          amount: line.lineTotal,
          currency: 'ETB',
          customerName: (data.customerName || '').trim() || data.telegramUsername || 'Customer',
          customerEmail: (data.customerEmail || '').trim() || '',
          customerPhone: data.customerPhone || null,
          telegramUserId: data.telegramUserId || null,
          telegramUsername: data.telegramUsername || null,
          refCode: affiliate?.code || null,
          affiliateId: affiliate?.id || null,
          status: 'PENDING',
          paymentMode: mode,
        },
      });
      createdOrders.push(order);
    }

    const firstOrder = createdOrders[0];
    const returnUrl = `${this.frontendUrl()}/order/${firstOrder.id}/activation?tx_ref=${cartRef}`;
    let checkoutUrl = `${this.frontendUrl()}/pay/mock/${firstOrder.id}`;

    if (mode === 'live') {
      const title = lines.length > 1 ? `KeyVault cart (${lines.length} items)` : lines[0].product.name;
      const description =
        lines.length > 1
          ? `Digital goods bundle: ${lines.map((l) => `${l.product.name} x${l.quantity}`).join(', ')}`
          : `Digital license for ${lines[0].product.name}${lines[0].quantity > 1 ? ` x${lines[0].quantity}` : ''}`;

      const result = await this.chapaInitialize({
        txRef: cartRef,
        amount: totalAmount,
        title,
        description,
        data,
        returnUrl,
      });

      if (result.error) {
        await this.prisma.order.updateMany({
          where: { cartRef },
          data: { chapaTxRef: cartRef },
        });
        throw new BadRequestException(
          `የቻፓ ክፍያ ማስጀመር አልተቻለም: ${result.error}. እባክዎ እንደገና ይሞክሩ።`,
        );
      }
      checkoutUrl = result.checkoutUrl!;
    }

    await this.prisma.order.updateMany({
      where: { cartRef },
      data: { paymentUrl: checkoutUrl, chapaTxRef: cartRef },
    });

    return {
      cartRef,
      orderId: firstOrder.id,
      orderIds: createdOrders.map((o) => o.id),
      txRef: cartRef,
      paymentUrl: checkoutUrl,
      amount: totalAmount,
      currency: 'ETB',
      itemCount: lines.length,
      mode,
      testMode: mode === 'mock' || this.getMode().testMode,
      affiliate: affiliate ? { code: affiliate.code, rate: affiliate.commissionRate } : null,
    };
  }

  /** Verify by cartRef (cart) or txRef (legacy single) and settle when confirmed. */
  async verifyPayment(ref: string) {
    let orders = await this.prisma.order.findMany({
      where: { OR: [{ cartRef: ref }, { txRef: ref }] },
      include: { product: { include: { activationGuide: true } } },
      orderBy: { createdAt: 'asc' },
    });

    if (!orders.length) {
      throw new NotFoundException(`Order with reference ${ref} not found`);
    }

    const allPaid = orders.every((o) => o.status === 'PAID');
    if (allPaid) {
      return this.formatCartResponse(orders, ref);
    }

    const { mode } = this.getMode();
    if (mode === 'mock') {
      return this.formatCartResponse(orders, ref);
    }

    // Live: ask Chapa about the cart-level reference
    const chapaRef = orders[0].cartRef || orders[0].txRef;
    const secretKey = this.configService.get<string>('CHAPA_SECRET_KEY');
    try {
      const response = await axios.get(`https://api.chapa.co/v1/transaction/verify/${chapaRef}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
        timeout: 15000,
      });

      if (response.data?.status === 'success') {
        const settled = await this.settleCart(orders[0].cartRef || orders[0].txRef);
        return this.formatCartResponse(settled, ref);
      }
      return this.formatCartResponse(orders, ref);
    } catch (error: any) {
      this.logger.warn(`Chapa verify error: ${error?.response?.data?.message || error?.message}`);
      return this.formatCartResponse(orders, ref);
    }
  }

  /** Mark every order in a cart paid, queue delivery, commissions, notify. */
  async settleCart(ref: string) {
    const orders = await this.prisma.order.findMany({
      where: { OR: [{ cartRef: ref }, { txRef: ref }] },
      include: { product: { include: { activationGuide: true } } },
    });

    const settled: any[] = [];
    for (const order of orders) {
      settled.push(await this.settleOrder(order));
    }
    return settled;
  }

  private async settleOrder(order: any) {
    if (order.status === 'PAID' && order.licenseKey) {
      return this.reloadOrder(order.id);
    }

    // 1. Mark PAID immediately — payment confirmation never waits on the supplier
    if (order.status !== 'PAID') {
      order = await this.prisma.order.update({
        where: { id: order.id },
        data: { status: 'PAID' },
        include: { product: { include: { activationGuide: true } } },
      });
    }

    // 2. Deliver goods: background queue (Redis) or inline fallback
    if (this.fulfillmentQueue.enabled) {
      await this.fulfillmentQueue.enqueue(order.id);
    } else {
      try {
        const delivered = await this.fulfillOrder(order.id);
        if (delivered) await this.afterDelivered(delivered);
      } catch (err: any) {
        this.logger.error(`Inline fulfillment failed for ${order.txRef}: ${err.message}`);
      }
    }

    // 3. Affiliate commission (idempotent per order)
    const commission = await this.affiliatesService.createCommissionForOrder(order);
    if (commission && order.affiliateId) {
      const affiliate = await this.prisma.affiliate.findUnique({ where: { id: order.affiliateId } });
      if (affiliate?.telegramUserId) {
        this.telegramService.notifyAffiliateCommission({
          telegramUserId: affiliate.telegramUserId,
          productName: order.product?.name,
          amount: commission.amount,
          currency: order.currency,
        });
      }
    }

    return this.reloadOrder(order.id);
  }

  /**
   * Deliver one order's goods. Idempotent: a delivered order returns as-is.
   * Throws on supplier failure so the queue can retry (or inline caller logs).
   */
  async fulfillOrder(orderId: string) {
    const order = await this.reloadOrder(orderId);
    if (!order) return null;
    if (order.status !== 'PAID') return null; // never deliver unpaid goods
    if (order.fulfillmentStatus === 'DELIVERED' && order.licenseKey) return order;

    if (order.product?.source === 'HUBX' && order.product.supplierProductId) {
      await this.supplierService.fulfillOrder(order.id); // sets licenseKey + DELIVERED, throws on failure
    } else {
      const key = await this.licensesService.allocateKeyForOrder(
        order.productId,
        order.id,
        order.quantity || 1,
      );
      await this.prisma.order.update({
        where: { id: order.id },
        data: { licenseKey: key, fulfillmentStatus: 'DELIVERED' },
      });
    }
    return this.reloadOrder(order.id);
  }

  /** Post-delivery hook: Telegram the buyer their key. */
  async afterDelivered(order: any) {
    if (!order) return;
    this.telegramService.notifyOrderPaid({
      txRef: order.txRef,
      customerName: order.customerName,
      amount: order.amount,
      currency: order.currency,
      licenseKey: order.licenseKey,
      telegramUserId: order.telegramUserId,
      id: order.id,
      product: order.product ? { name: order.product.name } : null,
    });
  }

  /** Terminal delivery failure (queue exhausted) — flag for admin retry. */
  async markFulfillmentFailed(orderId: string, message: string) {
    try {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { fulfillmentStatus: 'FAILED', fulfillmentError: message.slice(0, 500) },
      });
    } catch {}
  }

  private async reloadOrder(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: { product: { include: { activationGuide: true } } },
    });
  }

  async mockConfirmOrder(orderId: string) {
    const { mode } = this.getMode();
    if (mode !== 'mock') {
      throw new BadRequestException('Mock confirmation is only available in test mode');
    }
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    const settled = await this.settleCart(order.cartRef || order.txRef);
    return this.formatCartResponse(settled, order.cartRef || order.txRef);
  }

  async handleWebhook(payload: any, rawBody: string | undefined, signature: string | undefined) {
    const webhookSecret = this.configService.get<string>('CHAPA_WEBHOOK_SECRET');

    if (webhookSecret && signature && rawBody) {
      const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      if (expected !== signature) {
        this.logger.warn('Webhook signature mismatch — rejected');
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    // Only successful charges settle orders (mirror career-lyft)
    if (payload?.event && payload.event !== 'charge.success') {
      return { status: 'ignored' };
    }

    const txRef = payload?.tx_ref || payload?.txRef || payload?.data?.tx_ref;
    if (txRef) {
      const orders = await this.prisma.order.findMany({
        where: { OR: [{ cartRef: txRef }, { txRef }] },
      });
      const pending = orders.filter((o) => o.status !== 'PAID');
      if (pending.length) {
        const settled = await this.settleCart(orders[0].cartRef || orders[0].txRef);
        return { status: 'success', orders: settled.map((o) => this.formatOrderResponse(o)) };
      }
    }
    return { status: 'success' };
  }

  /** Admin: retry HubX fulfillment for a PAID-but-failed order. */
  async retryFulfillment(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { product: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'PAID') throw new BadRequestException('Order is not paid yet');

    if (this.fulfillmentQueue.enabled) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { fulfillmentStatus: 'PENDING', fulfillmentError: null },
      });
      await this.fulfillmentQueue.enqueue(orderId);
      return { queued: true, order: this.formatOrderResponse(await this.reloadOrder(orderId)) };
    }

    const res = await this.supplierService.fulfillOrder(order.id);
    return { ...res, order: this.formatOrderResponse(await this.reloadOrder(order.id)) };
  }

  private formatCartResponse(orders: any[], ref: string) {
    const formatted = orders.map((o) => this.formatOrderResponse(o));
    const first = formatted[0];
    return {
      cart: formatted.length > 1,
      cartRef: first?.cartRef || ref,
      orders: formatted,
      // Backwards-compatible flattened fields for the activation page
      ...first,
      items: undefined,
    };
  }

  private formatOrderResponse(order: any) {
    if (!order) return null;
    const formattedProduct = order.product
      ? {
          ...order.product,
          costUSD: undefined,
          supplierProductId: undefined,
          marginMultiplier: undefined,
          gallery: order.product.gallery ? JSON.parse(order.product.gallery) : [],
          features: order.product.features ? JSON.parse(order.product.features) : [],
          requirements: order.product.requirements ? JSON.parse(order.product.requirements) : [],
          activationGuide: order.product.activationGuide
            ? {
                ...order.product.activationGuide,
                steps: order.product.activationGuide.steps
                  ? JSON.parse(order.product.activationGuide.steps)
                  : [],
              }
            : null,
        }
      : null;

    return {
      ...order,
      product: formattedProduct,
    };
  }
}
