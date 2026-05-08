const disputeStatusStyles: Record<string, string> = {
  OPEN: 'badge-yellow',
  UNDER_REVIEW: 'badge-blue',
  RESOLVED: 'badge-green',
};

const refundStatusStyles: Record<string, string> = {
  REQUESTED: 'badge-yellow',
  APPROVED: 'badge-green',
  DECLINED: 'badge-red',
};

export const DISPUTE_REASON_OPTIONS = [
  { value: 'item_not_received', label: 'Item not received' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'arrived_damaged', label: 'Arrived damaged' },
  { value: 'routine_return', label: 'Return within seller window' },
  { value: 'other', label: 'Other issue' },
] as const;

export const DISPUTE_RESOLUTION_OPTIONS = [
  { value: 'refund_only', label: 'Refund only' },
  { value: 'return_for_refund', label: 'Return for refund' },
] as const;

export const DISPUTE_ELIGIBLE_ORDER_STATUSES = ['PAID', 'SHIPPED', 'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP'] as const;

export const MAX_RETURN_WINDOW_DAYS = 30;

export function parseReturnWindowDays(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_RETURN_WINDOW_DAYS) {
    throw new Error(`Return window must be between 1 and ${MAX_RETURN_WINDOW_DAYS} days.`);
  }
  return parsed;
}

export function disputeStatusBadge(status: string) {
  return disputeStatusStyles[status] ?? 'badge-slate';
}

export function refundStatusBadge(status: string) {
  return refundStatusStyles[status] ?? 'badge-slate';
}

export function disputeStatusLabel(status: string) {
  switch (status) {
    case 'UNDER_REVIEW':
      return 'Under review';
    case 'RESOLVED':
      return 'Resolved';
    case 'OPEN':
      return 'Open';
    default:
      return status;
  }
}

export function refundStatusLabel(status: string) {
  switch (status) {
    case 'REQUESTED':
      return 'Refund requested';
    case 'APPROVED':
      return 'Refund approved';
    case 'DECLINED':
      return 'Refund declined';
    default:
      return status;
  }
}

function addDays(date: Date, days: number) {
  // Use an explicit timestamp calculation so the input Date is never mutated.
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function getReturnWindowState({
  returnWindowDays,
  orderStatus,
  updatedAt,
  pickupConfirmedAt,
}: {
  returnWindowDays?: number | null;
  orderStatus: string;
  updatedAt: Date;
  pickupConfirmedAt?: Date | null;
}) {
  if (!returnWindowDays) {
    return {
      title: 'No routine returns',
      detail: 'This seller does not offer a standard return window. Buyers can still open a dispute for delivery or item-condition problems.',
      closesAt: null,
      isOpen: false,
    };
  }

  const referenceDate =
    orderStatus === 'PICKED_UP'
      ? pickupConfirmedAt ?? updatedAt
      : orderStatus === 'DELIVERED'
        ? updatedAt
        : null;

  if (!referenceDate) {
    return {
      title: `${returnWindowDays}-day return window`,
      detail: 'The return window starts once the order is marked delivered or picked up.',
      closesAt: null,
      isOpen: false,
    };
  }

  const closesAt = addDays(referenceDate, returnWindowDays);
  const isOpen = closesAt.getTime() > Date.now();
  return {
    title: `${returnWindowDays}-day return window`,
    detail: `${isOpen ? 'Open until' : 'Closed on'} ${closesAt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}.`,
    closesAt,
    isOpen,
  };
}
