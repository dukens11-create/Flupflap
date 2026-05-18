import type { RefundRequestStatus } from '@prisma/client';

export const REFUND_STATUS_LABELS: Record<RefundRequestStatus, string> = {
  REQUESTED: 'Requested',
  SELLER_REVIEW: 'Under seller review',
  APPROVED: 'Approved',
  DENIED: 'Denied',
  REFUNDED: 'Refunded',
};

export function refundStatusBadge(status: RefundRequestStatus): string {
  switch (status) {
    case 'REQUESTED':
      return 'badge-yellow';
    case 'SELLER_REVIEW':
      return 'badge-blue';
    case 'APPROVED':
      return 'badge-blue';
    case 'DENIED':
      return 'badge-red';
    case 'REFUNDED':
      return 'badge-green';
    default:
      return 'badge-slate';
  }
}

export function normalizeRefundAmountCents(requestedAmountCents: number | undefined, orderTotalCents: number): number {
  if (!Number.isFinite(requestedAmountCents as number)) return orderTotalCents;
  const value = Math.floor(Number(requestedAmountCents));
  if (value <= 0) return orderTotalCents;
  if (value > orderTotalCents) return orderTotalCents;
  return value;
}

export function isOrderRefundEligible(orderStatus: string): boolean {
  return [
    'PAID',
    'SHIPPED',
    'DELIVERED',
    'READY_FOR_PICKUP',
    'PICKED_UP',
    'PARTIALLY_REFUNDED',
  ].includes(orderStatus);
}
