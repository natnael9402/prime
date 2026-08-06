/**
 * Seed — intentionally minimal.
 * Demo products were removed. The store is stocked exclusively by the admin:
 * import HubX supplier products (admin → Supplier) or create local products.
 * This seed only guarantees the default category exists so imports work.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.category.upsert({
    where: { slug: 'digital-products' },
    update: {},
    create: { name: 'ዲጂታል ፕሮዳክቶች', slug: 'digital-products', icon: 'KeyRound' },
  });
  console.log('Seed complete: default category ready. No demo data is created.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
