import type { OrderStatus } from '@prisma/client';

export const REVIEW_ELIGIBLE_ORDER_STATUSES: OrderStatus[] = [
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'READY_FOR_PICKUP',
  'PICKED_UP',
];

export function isReviewEligibleStatus(status: OrderStatus | string) {
  return REVIEW_ELIGIBLE_ORDER_STATUSES.includes(status as OrderStatus);
}

export function formatAverageRating(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return value.toFixed(1);
}
