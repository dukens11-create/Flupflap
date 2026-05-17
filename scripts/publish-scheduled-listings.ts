import { prisma } from '../lib/db';

async function main() {
  const now = new Date();
  const result = await prisma.product.updateMany({
    where: {
      status: 'SCHEDULED',
      scheduledFor: { lte: now },
    },
    data: {
      status: 'ACTIVE',
      publishedAt: now,
      scheduledFor: null,
    },
  });

  console.log(`[publish-scheduled-listings] Published ${result.count} listing(s) at ${now.toISOString()}`);
}

main()
  .catch((error) => {
    console.error('[publish-scheduled-listings] Failed to publish scheduled listings', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
