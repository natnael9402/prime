import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface SendBroadcastDto {
  productId: string;
  caption: string;
  imageUrl: string;
  buttonText: string;
}

const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 700;
const MAX_CAPTION_LEN = 1024; // Telegram photo caption hard limit
const MAX_BUTTON_LEN = 64;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Headline products with ready-made campaigns (live data is fetched from DB). */
const PRESETS = [
  {
    key: 'adobe',
    productId: 'cd16f1e3-b965-4703-a8f7-f7cae31b775f',
    buttonText: '🎨 Get Adobe Express',
    caption:
      '🎨 <b>Adobe Express ለ1 ዓመት አሁን ይገኛል!</b>\n' +
      'ከ20,000+ በላይ ፎቶግራፎችን፣ ቴምፕሌቶችን እና የዲዛይን ፕሮግራሞችን በ999 ብር ብቻ ያግኙ። ዋጋው ከ22,000 ብር ተቀንሷል — እድሉን አያምልጡ!\n\n' +
      '⏳ <b>Adobe Express is available now!</b>\n' +
      'Get 1 year of premium access to 20,000+ photos, templates, and design assets for only 999 ETB instead of 22,000 ETB. Limited stock — buy now before it’s gone!',
  },
  {
    key: 'coursera',
    productId: '74140c02-3eb3-4716-a1d6-bbb9ea5c43cb',
    buttonText: '🎓 Get Coursera Premium',
    caption:
      '🎓 <b>Coursera Premium ለ12 ወር አሁን ይገኛል!</b>\n' +
      'ከ10,000+ በላይ ትምህርቶችን፣ የሙያ ሰርተፊኬቶችን እና የዲግሪ ፕሮግራሞችን ያግኙ። ከYale፣ Google እና IBM ጋር ይማሩ — ሁሉም በአንድ ምዝገባ!\n\n' +
      '🚀 <b>Coursera Premium 12 Months is here!</b>\n' +
      'Unlock 10,000+ courses, professional certificates, and degree programs from top universities and companies. Limited slots — secure yours today!',
  },
  {
    key: 'gemini',
    productId: 'c1757720-14a1-4d38-ad90-46bd8f528f7a',
    buttonText: '✨ Get Gemini Pro',
    caption:
      '✨ <b>Gemini Pro ለ18 ወር አሁን ይገኛል!</b>\n' +
      'የGoogleን ሁሉንም የAI ኃይል ይክፈቱ — Veo፣ NotebookLM እና 2TB ማከማቻ ጨምሮ። በ999 ብር ብቻ!\n\n' +
      '⚡ <b>Gemini Pro 18 Months is live!</b>\n' +
      'Unlock Google’s full AI power — including Veo, NotebookLM, and 2TB storage — for only 999 ETB. Stock is limited, grab yours now!',
  },
];

@Injectable()
export class BroadcastService implements OnModuleInit {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** If the API restarted mid-broadcast, don't leave a spinner running forever. */
  async onModuleInit() {
    try {
      await this.prisma.broadcast.updateMany({
        where: { status: 'RUNNING' },
        data: { status: 'FAILED', error: 'Server restarted during broadcast', completedAt: new Date() },
      });
    } catch {
      // Table may not exist yet on first boot before prisma db push.
    }
  }

  private get storeUrl(): string {
    return (
      this.config.get<string>('TELEGRAM_WEBAPP_URL') ||
      this.config.get<string>('FRONTEND_URL') ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  private get botToken(): string {
    return this.config.get<string>('TELEGRAM_BOT_TOKEN') || '';
  }

  /** Preset cards with live product data (price, stock, banner). */
  async getPresets() {
    const ids = PRESETS.map((p) => p.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, price: true, currency: true, stock: true, bannerUrl: true, slug: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return PRESETS.map((preset) => {
      const product = byId.get(preset.productId);
      return {
        key: preset.key,
        productId: preset.productId,
        name: product?.name || preset.key,
        price: product?.price ?? null,
        currency: product?.currency || 'ETB',
        stock: product?.stock ?? null,
        imageUrl: product?.bannerUrl || '',
        productUrl: `${this.storeUrl}/product/${preset.productId}`,
        caption: preset.caption,
        buttonText: preset.buttonText,
        available: !!product,
      };
    });
  }

  async list() {
    return this.prisma.broadcast.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async getOne(id: string) {
    const row = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Broadcast not found');
    return row;
  }

  async send(dto: SendBroadcastDto) {
    const productId = String(dto.productId || '').trim();
    const caption = String(dto.caption || '').trim();
    const imageUrl = String(dto.imageUrl || '').trim();
    const buttonText = String(dto.buttonText || '').trim();

    if (!productId) throw new BadRequestException('Product is required');
    if (!caption) throw new BadRequestException('Caption is required');
    if (caption.length > MAX_CAPTION_LEN) {
      throw new BadRequestException(`Caption is too long (${caption.length}/${MAX_CAPTION_LEN} characters)`);
    }
    if (!/^https?:\/\//i.test(imageUrl)) throw new BadRequestException('A valid image URL is required');
    if (!buttonText) throw new BadRequestException('Button text is required');
    if (buttonText.length > MAX_BUTTON_LEN) throw new BadRequestException('Button text is too long');
    if (!this.botToken || this.botToken.length < 20) {
      throw new BadRequestException('Telegram bot token is not configured');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const record = await this.prisma.broadcast.create({
      data: {
        productId: product.id,
        productName: product.name,
        productUrl: `${this.storeUrl}/product/${product.id}`,
        imageUrl,
        caption,
        buttonText,
      },
    });

    // Fire and forget — the admin UI polls GET /broadcasts/admin/:id for progress.
    void this.runBroadcast(record.id).catch((err) =>
      this.logger.error(`Broadcast ${record.id} crashed: ${err?.message}`),
    );

    return record;
  }

  private async getRecipients(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ telegram_id: string }[]>`
      SELECT DISTINCT telegram_id
      FROM (
        SELECT "telegramId"::text AS telegram_id FROM "TgUser"
        UNION
        SELECT "telegramUserId"::text AS telegram_id FROM "Order"
        WHERE "telegramUserId" IS NOT NULL
        UNION
        SELECT "telegramUserId"::text AS telegram_id FROM "StockAlert"
        UNION
        SELECT "telegramUserId"::text AS telegram_id FROM "Affiliate"
        WHERE "telegramUserId" IS NOT NULL
      ) users
      WHERE telegram_id ~ '^-?[0-9]+$'
      ORDER BY telegram_id
    `;
    return rows.map((r) => r.telegram_id);
  }

  private async runBroadcast(id: string) {
    const record = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!record || record.status !== 'RUNNING') return;

    let sent = 0;
    let failed = 0;
    const failures = new Map<string, number>();
    // Send the photo by URL once, then reuse Telegram's cached file_id —
    // much faster and avoids hammering the CDN 2,000+ times.
    let cachedFileId: string | null = null;

    try {
      const recipients = await this.getRecipients();
      const total = recipients.length;
      await this.prisma.broadcast.update({ where: { id }, data: { total } });
      this.logger.log(`Broadcast ${id}: sending to ${total} recipients`);

      const sendOne = async (chatId: string) => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const payload: Record<string, any> = {
              chat_id: chatId,
              photo: cachedFileId || record.imageUrl,
              caption: record.caption,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: [
                  [{ text: record.buttonText, web_app: { url: record.productUrl } }],
                ],
              },
            };
            const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendPhoto`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            const body: any = await res.json().catch(() => ({}));

            if (res.ok && body.ok) {
              if (!cachedFileId) {
                const photos = Array.isArray(body.result?.photo) ? body.result.photo : [];
                const largest = photos.sort(
                  (a: any, b: any) => (b.file_size || b.width * b.height) - (a.file_size || a.width * a.height),
                )[0];
                cachedFileId = largest?.file_id || null;
              }
              return { ok: true as const };
            }
            if (res.status === 429) {
              const retryAfter = Number(body?.parameters?.retry_after || 1);
              await sleep((retryAfter + 1) * 1000);
              continue;
            }
            return { ok: false as const, status: res.status, description: body.description || `HTTP ${res.status}` };
          } catch (err: any) {
            if (attempt === 2) return { ok: false as const, status: 0, description: err?.message || 'network error' };
            await sleep(1500);
          }
        }
        return { ok: false as const, status: 0, description: 'retry limit reached' };
      };

      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(sendOne));

        for (const r of results) {
          if (r.ok) sent += 1;
          else {
            failed += 1;
            const key = `${r.status}: ${r.description}`;
            failures.set(key, (failures.get(key) || 0) + 1);
          }
        }

        await this.prisma.broadcast.update({
          where: { id },
          data: { sent, failed, failureSummary: JSON.stringify(Object.fromEntries(failures)) },
        });

        if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_DELAY_MS);
      }

      await this.prisma.broadcast.update({
        where: { id },
        data: { status: 'COMPLETED', sent, failed, completedAt: new Date() },
      });
      this.logger.log(`Broadcast ${id}: DONE total=${total} sent=${sent} failed=${failed}`);
    } catch (err: any) {
      await this.prisma.broadcast.update({
        where: { id },
        data: {
          status: 'FAILED',
          error: err?.message || 'unknown error',
          sent,
          failed,
          failureSummary: JSON.stringify(Object.fromEntries(failures)),
          completedAt: new Date(),
        },
      });
      this.logger.error(`Broadcast ${id}: FAILED ${err?.message}`);
    }
  }
}
