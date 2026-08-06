import { Controller, Post, Get, Body, Param, Headers, Req, UseGuards } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('mode')
  async mode() {
    return this.paymentsService.getMode();
  }

  // Payment initiation is the #1 abuse target — strict per-IP limit
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('initialize')
  async initialize(
    @Body()
    body: {
      productId: string;
      quantity?: number;
      customerName: string;
      customerEmail: string;
      customerPhone?: string;
      telegramUserId?: string;
      telegramUsername?: string;
      refCode?: string;
    },
  ) {
    return this.paymentsService.initializePayment(body);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('initialize-cart')
  async initializeCart(
    @Body()
    body: {
      items: { productId: string; quantity: number }[];
      customerName: string;
      customerEmail: string;
      customerPhone?: string;
      telegramUserId?: string;
      telegramUsername?: string;
      refCode?: string;
    },
  ) {
    return this.paymentsService.initializeCart(body);
  }

  @Get('verify/:txRef')
  async verify(@Param('txRef') txRef: string) {
    return this.paymentsService.verifyPayment(txRef);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('mock-confirm/:orderId')
  async mockConfirm(@Param('orderId') orderId: string) {
    return this.paymentsService.mockConfirmOrder(orderId);
  }

  @UseGuards(AdminGuard)
  @Post('admin/retry-fulfillment/:orderId')
  async retryFulfillment(@Param('orderId') orderId: string) {
    return this.paymentsService.retryFulfillment(orderId);
  }

  // Chapa calls this — never throttle the source of truth for payments
  @SkipThrottle()
  @Post('webhook')
  async webhook(
    @Body() payload: any,
    @Req() req: any,
    @Headers('x-chapa-signature') chapaSignature?: string,
    @Headers('chapa-signature') altSignature?: string,
  ) {
    const raw = req?.rawBody || JSON.stringify(payload || {});
    return this.paymentsService.handleWebhook(payload, raw, chapaSignature || altSignature);
  }
}
