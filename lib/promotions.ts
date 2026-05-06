/**
 * Promotion packages available to sellers.
 * Key = duration in days, value = price in cents.
 * Admin pricing changes should be made here — this is the single source of truth.
 */
export const PROMOTION_PACKAGES: Record<number, number> = {
  1:  399,  // $3.99  for 1 day
  3:  899,  // $8.99  for 3 days
  7:  1499, // $14.99 for 7 days
  14: 2499, // $24.99 for 14 days
  30: 4499, // $44.99 for 30 days
};

/** Ordered list of packages for UI rendering. */
export const PROMOTION_PACKAGE_LIST = [
  { days: 1,  priceCents: 399,  label: '1 day',   description: 'Quick boost for time-sensitive items' },
  { days: 3,  priceCents: 899,  label: '3 days',  description: 'Great for fast-selling items' },
  { days: 7,  priceCents: 1499, label: '7 days',  description: 'Popular choice for most sellers' },
  { days: 14, priceCents: 2499, label: '14 days', description: 'Extended visibility' },
  { days: 30, priceCents: 4499, label: '30 days', description: 'Maximum exposure' },
] as const;

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
