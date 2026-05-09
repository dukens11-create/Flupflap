import { prisma } from '@/lib/db';

type FindConflictingSellerByPhoneParams = {
  phone: string;
  excludeUserId?: string;
};

export async function findConflictingSellerByPhone({
  phone,
  excludeUserId,
}: FindConflictingSellerByPhoneParams) {
  return prisma.user.findFirst({
    where: {
      role: 'SELLER',
      phone,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
}
