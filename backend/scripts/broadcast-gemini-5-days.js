require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { Client } = require('pg');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const STORE_BASE_URL = (
  process.env.PUBLIC_STORE_URL || 'https://187.127.92.55.sslip.io'
).replace(/\/$/, '');
const PRODUCT_ID = 'c1757720-14a1-4d38-ad90-46bd8f528f7a';
const PRODUCT_URL = `${STORE_BASE_URL}/product/${PRODUCT_ID}`;
const IMAGE_PATH = path.resolve(__dirname, '../../assets/broadcasts/gemini-5-days-left.png');

const CAPTION =
  '🚨 <b>2 ቀናት ብቻ ቀርተዋል!</b>\n' +
  'Gemini Pro 18 Months ለመግዛት የሚችሉበት ጊዜ ሊያልቅ ነው። አሁኑኑ ይግዙ፤ ይህ እድል ሊያልፍዎ ነው!\n\n' +
  '⚠️ <b>Guyyaa 2 qofa hafe!</b>\n' +
  'Gemini Pro 18 Months bitachuuf yeroo hafe gabaabaa dha. Amma ariifachuun bitadhaa — carraan kun darbaa hin deebi’u!\n\n' +
  '⏰ <b>Only 2 days left!</b>\n' +
  'Gemini Pro 18 Months is still available, but time is almost up. Buy now before the offer ends — don’t miss your chance!';

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1100;
const START_INDEX = Math.max(0, Number(process.env.BROADCAST_START_INDEX || 0));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let telegramPhotoFileId = null;

function payloadFor(chatId) {
  return {
    chat_id: chatId,
    caption: CAPTION,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🛒 Buy Gemini Now', web_app: { url: PRODUCT_URL } }],
      ],
    },
  };
}

async function parseResponse(response) {
  return response.json().catch(() => ({}));
}

async function sendUploadedPhoto(chatId) {
  const image = await fs.readFile(IMAGE_PATH);
  const form = new FormData();
  const payload = payloadFor(chatId);

  form.append('chat_id', String(payload.chat_id));
  form.append('caption', payload.caption);
  form.append('parse_mode', payload.parse_mode);
  form.append('disable_web_page_preview', 'true');
  form.append('reply_markup', JSON.stringify(payload.reply_markup));
  form.append('photo', new Blob([image], { type: 'image/png' }), 'gemini-5-days-left.png');

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  const body = await parseResponse(response);

  if (response.ok && body.ok) {
    const photos = Array.isArray(body.result?.photo) ? body.result.photo : [];
    const largest = photos.sort(
      (a, b) => (b.file_size || b.width * b.height) - (a.file_size || a.width * a.height),
    )[0];
    telegramPhotoFileId = largest?.file_id || null;
    return { ok: true };
  }

  return { ok: false, response, body };
}

async function sendCachedPhoto(chatId) {
  const payload = payloadFor(chatId);
  payload.photo = telegramPhotoFileId;

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await parseResponse(response);
  return { ok: response.ok && body.ok, response, body };
}

async function sendPhoto(chatId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = telegramPhotoFileId
        ? await sendCachedPhoto(chatId)
        : await sendUploadedPhoto(chatId);

      if (result.ok) return { ok: true };

      const { response, body } = result;
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

async function getRecipients() {
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
  return result.rows.map((row) => row.telegram_id);
}

async function main() {
  if (!BOT_TOKEN || BOT_TOKEN.length < 20) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing or invalid');
  }
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is missing');
  }
  if (CAPTION.length > 1024) {
    throw new Error(`Telegram photo caption is too long: ${CAPTION.length} characters`);
  }

  await fs.access(IMAGE_PATH);
  const allRecipients = await getRecipients();
  const recipients = allRecipients.slice(START_INDEX);
  let sent = 0;
  let failed = 0;
  const failures = new Map();

  console.log(
    `Broadcasting Gemini photo to ${recipients.length} Telegram users (starting at index ${START_INDEX} of ${allRecipients.length})...`,
  );
  console.log(`Product URL: ${PRODUCT_URL}`);
  console.log(`Caption characters: ${CAPTION.length}`);

  for (let index = 0; index < recipients.length; index += BATCH_SIZE) {
    const batch = recipients.slice(index, index + BATCH_SIZE);
    const results = await Promise.all(batch.map(sendPhoto));

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
  console.log(`Telegram cached photo: ${telegramPhotoFileId ? 'yes' : 'no'}`);
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
