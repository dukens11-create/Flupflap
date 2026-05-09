import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * One-time backfill: set dukens0411@gmail.com phone to +17755287791.
 *
 * Usage:
 *   DATABASE_URL='postgresql://...' npx tsx prisma/backfills/20260509_update_dukens0411_phone.ts
 *
 * Safe to remove after successful production run.
 */

const TARGET_EMAIL = 'dukens0411@gmail.com';
const TARGET_PHONE = '+17755287791';

function getPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run this backfill.');
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

async function main() {
  const prisma = getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { email: TARGET_EMAIL },
        select: { id: true, email: true, phone: true, phoneVerified: true, phoneVerifiedAt: true },
      });

      if (!targetUser) {
        throw new Error(`Backfill aborted: user not found for email ${TARGET_EMAIL}.`);
      }

      const conflictingUser = await tx.user.findFirst({
        where: {
          phone: TARGET_PHONE,
          id: { not: targetUser.id },
        },
        select: { id: true, email: true, role: true },
      });

      if (conflictingUser) {
        throw new Error(
          `Backfill aborted: phone ${TARGET_PHONE} is already used by ${conflictingUser.email} (${conflictingUser.role}, id=${conflictingUser.id}).`,
        );
      }

      const updatedUser = await tx.user.update({
        where: { id: targetUser.id },
        data: {
          phone: TARGET_PHONE,
          phoneVerified: false,
          phoneVerifiedAt: null,
        },
        select: { id: true, email: true, phone: true, phoneVerified: true, phoneVerifiedAt: true },
      });

      return { before: targetUser, after: updatedUser };
    });

    console.log('Backfill completed successfully.');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
