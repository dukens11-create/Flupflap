import { prisma } from '@/lib/db';

export const DEFAULT_PROMOTION_PLANS = [
  { durationDays: 1, label: '24 hours', description: 'Quick boost for newly listed items', priceCents: 399, sortOrder: 10 },
  { durationDays: 3, label: '3 days', description: 'Weekend visibility for active shoppers', priceCents: 899, sortOrder: 20 },
  { durationDays: 7, label: '7 days', description: 'Great for fast-selling items', priceCents: 1499, sortOrder: 30 },
  { durationDays: 14, label: '14 days', description: 'Best for most sellers', priceCents: 2499, sortOrder: 40 },
  { durationDays: 30, label: '30 days', description: 'Maximum exposure for premium listings', priceCents: 4499, sortOrder: 50 },
] as const;

export function getPromotionLabel(durationDays: number): string {
  return DEFAULT_PROMOTION_PLANS.find(plan => plan.durationDays === durationDays)?.label
    ?? `${durationDays} day${durationDays === 1 ? '' : 's'}`;
}

export async function ensurePromotionPlans() {
  await prisma.$transaction(
    DEFAULT_PROMOTION_PLANS.map(plan => (
      prisma.promotionPlan.upsert({
        where: { durationDays: plan.durationDays },
        update: {
          label: plan.label,
          description: plan.description,
          sortOrder: plan.sortOrder,
        },
        create: plan,
      })
    )),
  );
}

export async function getPromotionPlans() {
  await ensurePromotionPlans();
  return prisma.promotionPlan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function getPromotionPlan(durationDays: number) {
  await ensurePromotionPlans();
  return prisma.promotionPlan.findUnique({ where: { durationDays } });
}

export async function expirePromotions() {
  return prisma.promotion.updateMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lte: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
}
