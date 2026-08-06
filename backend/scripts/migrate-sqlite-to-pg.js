/**
 * One-time migration: SQLite (dev) → Postgres (production).
 *
 * Run order (IMPORTANT — while the generated Prisma client is still SQLite-flavored):
 *   1. Provision Postgres, set PG_DATABASE_URL=postgres://user:pass@host:5432/db
 *   2. npx prisma db push --schema prisma/schema.postgres.prisma   (creates tables)
 *      (run that with DATABASE_URL pointing at Postgres)
 *   3. node scripts/migrate-sqlite-to-pg.js
 *   4. npm run prisma:generate:pg && restart the backend with the Postgres DATABASE_URL
 */
require('dotenv').config();
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { Client } = require('pg');

const PG_URL = process.env.PG_DATABASE_URL || process.env.DATABASE_URL;
if (!PG_URL || !PG_URL.startsWith('postgres')) {
  console.error('Set PG_DATABASE_URL=postgres://... before running.');
  process.exit(1);
}

// Order matters: parents before children (FK integrity)
const TABLES = [
  { model: 'category', table: 'Category', cols: ['id', 'name', 'slug', 'icon', 'createdAt', 'updatedAt'] },
  { model: 'setting', table: 'Setting', cols: ['id', 'key', 'value', 'updatedAt'] },
  { model: 'tgUser', table: 'TgUser', cols: ['id', 'telegramId', 'firstName', 'lastName', 'username', 'photoUrl', 'languageCode', 'createdAt', 'lastSeenAt'] },
  { model: 'product', table: 'Product', cols: ['id', 'name', 'slug', 'description', 'shortDesc', 'price', 'originalPrice', 'currency', 'badge', 'bannerUrl', 'gallery', 'features', 'requirements', 'stock', 'instantDelivery', 'isFeatured', 'source', 'supplierProductId', 'costUSD', 'priceMode', 'marginMultiplier', 'discountPct', 'categoryId', 'createdAt', 'updatedAt'] },
  { model: 'licenseKey', table: 'LicenseKey', cols: ['id', 'productId', 'code', 'isUsed', 'orderId', 'createdAt'] },
  { model: 'activationGuide', table: 'ActivationGuide', cols: ['id', 'productId', 'steps', 'downloadUrl', 'notes', 'videoUrl', 'createdAt', 'updatedAt'] },
  { model: 'affiliate', table: 'Affiliate', cols: ['id', 'code', 'name', 'phone', 'email', 'telegramUserId', 'telegramUsername', 'status', 'commissionRate', 'clicks', 'payoutMethod', 'payoutAccount', 'createdAt', 'updatedAt'] },
  { model: 'order', table: 'Order', cols: ['id', 'txRef', 'cartRef', 'telegramUserId', 'telegramUsername', 'customerEmail', 'customerPhone', 'customerName', 'productId', 'quantity', 'amount', 'currency', 'status', 'licenseKey', 'paymentUrl', 'chapaTxRef', 'paymentMode', 'fulfillmentStatus', 'supplierOrderId', 'fulfillmentError', 'refCode', 'affiliateId', 'commissionAmount', 'createdAt', 'updatedAt'] },
  { model: 'commission', table: 'Commission', cols: ['id', 'affiliateId', 'orderId', 'amount', 'rate', 'status', 'paidAt', 'note', 'createdAt'] },
];

(async () => {
  const sqlite = new PrismaClient(); // reads current dev.db via DATABASE_URL in .env
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  let total = 0;
  for (const { model, table, cols } of TABLES) {
    const rows = await sqlite[model].findMany();
    if (!rows.length) {
      console.log(`${table}: 0 rows (skipped)`);
      continue;
    }
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT ("id") DO NOTHING`;
    let inserted = 0;
    for (const row of rows) {
      const values = cols.map((c) => (row[c] === undefined ? null : row[c]));
      try {
        await pg.query(sql, values);
        inserted++;
      } catch (err) {
        console.error(`${table} row ${row.id} failed: ${err.message}`);
      }
    }
    total += inserted;
    console.log(`${table}: ${inserted}/${rows.length} rows migrated`);
  }

  console.log(`\nDone. ${total} total rows migrated to Postgres.`);
  await pg.end();
  await sqlite.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
