import type { RefundRequestStatus } from '@prisma/client';
import { normalizeOrderStatus } from '@/lib/order-status';

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
  if (requestedAmountCents === undefined || !Number.isFinite(requestedAmountCents)) return orderTotalCents;
  const value = Math.floor(requestedAmountCents);
  if (value <= 0) return orderTotalCents;
  if (value > orderTotalCents) return orderTotalCents;
  return value;
}

export function isOrderRefundEligible(orderStatus: string): boolean {
  // Normalize deprecated statuses before checking eligibility so that legacy
  // records (e.g. READY_FOR_PICKUP → PAID) still qualify correctly.
  const normalized = normalizeOrderStatus(orderStatus);
  return ['PAID', 'SHIPPED', 'DELIVERED', 'PICKED_UP', 'PARTIALLY_REFUNDED'].includes(normalized);
}
