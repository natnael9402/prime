import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import { RedisService } from '../infra/redis.service';
import { PaymentsService } from './payments.service';

const QUEUE_NAME = 'fulfillment';
const MAX_ATTEMPTS = 5;

/**
 * Background fulfillment: payment confirmation returns instantly;
 * a worker delivers the goods (HubX order / local key pool) with
 * exponential-backoff retries. Without Redis, callers fulfill inline
 * (identical to the old behavior) — see PaymentsService.settleOrder.
 */
@Injectable()
export class FulfillmentQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FulfillmentQueue.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private redis: RedisService,
    private config: ConfigService,
    @Inject(forwardRef(() => PaymentsService))
    private payments: PaymentsService,
  ) {}

  get enabled(): boolean {
    return !!this.queue;
  }

  onModuleInit() {
    const connection = this.redis.bullmqConnection;
    if (!connection) {
      this.logger.log('No REDIS_URL — fulfillment runs inline (single-process mode).');
      return;
    }

    this.queue = new Queue(QUEUE_NAME, { connection: connection as any });

    const workerEnabled = (this.config.get<string>('QUEUE_WORKER_ENABLED') || 'true') !== 'false';
    if (workerEnabled) {
      this.worker = new Worker(
        QUEUE_NAME,
        async (job: Job<{ orderId: string }>) => this.process(job),
        { connection: connection as any, concurrency: 5 },
      );
      this.worker.on('failed', (job, err) =>
        this.logger.warn(`Fulfillment job ${job?.id} attempt ${job?.attemptsMade} failed: ${err?.message}`),
      );
      this.logger.log('Fulfillment queue + worker active (BullMQ).');
    } else {
      this.logger.log('Fulfillment queue active (enqueue-only; worker disabled on this process).');
    }
  }

  async enqueue(orderId: string) {
    if (!this.queue) return;
    await this.queue.add(
      'fulfill',
      { orderId },
      {
        jobId: `fulfill-${orderId}`, // dedupe: same order can never be queued twice
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: false, // keep failed jobs for inspection / admin retry
      },
    );
  }

  private async process(job: Job<{ orderId: string }>) {
    const isFinalAttempt = job.attemptsMade + 1 >= MAX_ATTEMPTS;
    try {
      const delivered = await this.payments.fulfillOrder(job.data.orderId);
      if (delivered) await this.payments.afterDelivered(delivered);
    } catch (err: any) {
      if (isFinalAttempt) {
        await this.payments.markFulfillmentFailed(job.data.orderId, err?.message || 'unknown error');
      }
      throw err; // let BullMQ handle retry / terminal failure
    }
  }

  async onModuleDestroy() {
    if (this.worker) await this.worker.close().catch(() => undefined);
    if (this.queue) await this.queue.close().catch(() => undefined);
  }
}
