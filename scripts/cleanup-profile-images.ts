import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const TARGET_EMAILS = [
  'dukens0411@gmail.com',
  'admin@flupflap.com',
  'seller@flupflap.com',
] as const;

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const confirm = process.argv.includes('--confirm');
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const users = await prisma.user.findMany({
      where: { email: { in: [...TARGET_EMAILS] } },
      select: { email: true, image: true },
      orderBy: { email: 'asc' },
    });

    const withImage = users.filter((user) => Boolean(user.image));

    console.log('[cleanup-profile-images] Target emails:', TARGET_EMAILS.join(', '));
    console.log('[cleanup-profile-images] Matched accounts:', users.map((user) => user.email).join(', ') || '(none)');
    console.log('[cleanup-profile-images] Accounts with stored profile image:', withImage.map((user) => user.email).join(', ') || '(none)');

    if (!confirm) {
      console.log('[cleanup-profile-images] Dry run only. Re-run with --confirm to set image = null.');
      return;
    }

    const result = await prisma.user.updateMany({
      where: {
        email: { in: [...TARGET_EMAILS] },
        image: { not: null },
      },
      data: { image: null },
    });

    console.log(`[cleanup-profile-images] Updated ${result.count} account(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error('[cleanup-profile-images] Failed:', error);
  process.exit(1);
});
