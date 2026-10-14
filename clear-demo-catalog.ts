import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const demo = await prisma.product.findMany({ where: { sku: { startsWith: 'SR-' } }, select: { id: true, name: true, sku: true } });
  let removed = 0;
  let skipped = 0;
  for (const p of demo) {
    const ordered = await prisma.orderItem.count({ where: { productId: p.id } });
    if (ordered) { skipped++; console.log(`Skipped ${p.sku} (${p.name}) because it has order history.`); continue; }
    await prisma.$transaction(async tx => {
      await tx.cartItem.deleteMany({ where: { productId: p.id } });
      await tx.wishlist.deleteMany({ where: { productId: p.id } });
      await tx.productImage.deleteMany({ where: { productId: p.id } });
      await tx.productVariant.deleteMany({ where: { productId: p.id } });
      await tx.review.deleteMany({ where: { productId: p.id } });
      await tx.product.delete({ where: { id: p.id } });
    });
    removed++;
  }
  console.log(`Demo catalog cleanup complete. Removed: ${removed}. Skipped with order history: ${skipped}.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
