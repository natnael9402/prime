const { Client } = require('pg');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const WEB_APP_URL =
  process.env.TELEGRAM_WEBAPP_URL ||
  process.env.FRONTEND_URL ||
  'https://187.127.92.55.sslip.io/';

const MESSAGE =
  '✅ <b>PrimeStore Ethiopia is back online.</b>\n\nYou can buy now.';

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendMessage(chatId) {
  const payload = {
    chat_id: chatId,
    text: MESSAGE,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Open Store', web_app: { url: WEB_APP_URL } }],
      ],
    },
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));

      if (response.ok && body.ok) return { ok: true };

      if (response.status === 429) {
        const retryAfter = Number(body?.parameters?.retry_after || 1);
        await sleep((retryAfter + 1) * 1000);
        continue;
      }

      return {
        ok: false,
        status: response.status,
        description: body.description || `HTTP ${response.status}`,
      };
    } catch (error) {
      if (attempt === 2) {
        return { ok: false, status: 0, description: error.message };
      }
      await sleep(1500);
    }
  }

  return { ok: false, status: 0, description: 'retry limit reached' };
}

async function main() {
  if (!BOT_TOKEN || BOT_TOKEN.length < 20) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing or invalid');
  }
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is missing');
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const result = await client.query(`
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
  `);

  await client.end();

  const recipients = result.rows.map((row) => row.telegram_id);
  let sent = 0;
  let failed = 0;
  const failures = new Map();

  console.log(`Broadcasting to ${recipients.length} Telegram users...`);

  for (let index = 0; index < recipients.length; index += BATCH_SIZE) {
    const batch = recipients.slice(index, index + BATCH_SIZE);
    const results = await Promise.all(batch.map(sendMessage));

    for (const item of results) {
      if (item.ok) {
        sent += 1;
      } else {
        failed += 1;
        const key = `${item.status}: ${item.description}`;
        failures.set(key, (failures.get(key) || 0) + 1);
      }
    }

    console.log(
      `Progress ${Math.min(index + BATCH_SIZE, recipients.length)}/${recipients.length} — sent ${sent}, failed ${failed}`,
    );

    if (index + BATCH_SIZE < recipients.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`DONE total=${recipients.length} sent=${sent} failed=${failed}`);
  if (failures.size > 0) {
    console.log('Failure summary:');
    for (const [description, count] of failures.entries()) {
      console.log(`- ${count} × ${description}`);
    }
  }
}

main().catch((error) => {
  console.error(`BROADCAST_FAILED ${error.message}`);
  process.exit(1);
});
