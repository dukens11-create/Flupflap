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

/**
 * Returns the Prisma `where` conditions for an "actually running" promotion:
 * status is ACTIVE, has already started, and has not yet expired.
 * Both `startsAt` and `expiresAt` must be non-null for the promotion to be
 * considered active; records with null dates (e.g. still PENDING_PAYMENT) are
 * excluded automatically by the `not: null` guard.
 * Use this filter everywhere to ensure scheduled (pre-paid, future-starting)
 * renewals are not treated as currently active until their start date.
 */
export function activePromotionWhere(now: Date) {
  return {
    status: 'ACTIVE' as const,
    startsAt: { not: null, lte: now },
    expiresAt: { not: null, gt: now },
  };
}

/**
 * In-memory predicate equivalent of `activePromotionWhere`.
 * Use this when the promotion object is already loaded (e.g. from an included
 * relation) and you need to determine whether it is currently active without
 * an additional database query.
 */
export function isPromotionActive(
  promo: { status: string; startsAt: Date | null; expiresAt: Date | null } | null | undefined,
  now: Date,
): boolean {
  return (
    !!promo &&
    promo.status === 'ACTIVE' &&
    promo.startsAt !== null && promo.startsAt <= now &&
    promo.expiresAt !== null && promo.expiresAt > now
  );
}
