type GarageSaleVisibilityInput = {
  status: string;
  paymentStatus: string;
  isArchived?: boolean | null;
  isSpam?: boolean | null;
};

export type GarageSaleVisibilityBlockReason =
  | 'ARCHIVED'
  | 'SPAM'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_UNPAID'
  | 'HIDDEN'
  | 'NOT_APPROVED'
  | null;

export function isGarageSalePubliclyVisible(sale: GarageSaleVisibilityInput) {
  return sale.status === 'APPROVED' && sale.paymentStatus === 'PAID' && !sale.isArchived && !sale.isSpam;
}

export function getGarageSaleVisibilityBlockReason(sale: GarageSaleVisibilityInput): GarageSaleVisibilityBlockReason {
  // Priority is intentional: archived/spam are hard stops, then payment gates,
  // then moderation/hidden status gates.
  if (sale.isArchived) return 'ARCHIVED';
  if (sale.isSpam) return 'SPAM';
  if (sale.paymentStatus === 'PENDING') return 'PAYMENT_PENDING';
  if (sale.paymentStatus !== 'PAID') return 'PAYMENT_UNPAID';
  if (sale.status === 'HIDDEN') return 'HIDDEN';
  if (sale.status !== 'APPROVED') return 'NOT_APPROVED';
  return null;
}

export function getGarageSaleLiveControlsBlockMessage(sale: GarageSaleVisibilityInput) {
  const reason = getGarageSaleVisibilityBlockReason(sale);
  if (reason === 'PAYMENT_PENDING') {
    return 'Live controls are unavailable while payment is pending. Your listing stays hidden until payment is confirmed.';
  }
  if (reason === 'PAYMENT_UNPAID') {
    return 'Live controls are unavailable because payment is not completed for this listing.';
  }
  if (sale.status === 'PENDING') {
    return 'Your listing is pending review. Live controls are unavailable until an admin approves it.';
  }
  if (sale.status === 'REJECTED') {
    return 'Your listing was rejected. Update details and try again before using live controls.';
  }
  if (reason === 'NOT_APPROVED') {
    return 'Live controls are unavailable until this listing is approved and visible.';
  }
  if (reason === 'HIDDEN') {
    return 'Live controls are unavailable while this listing is hidden.';
  }
  if (reason === 'ARCHIVED') {
    return 'Live controls are unavailable for archived listings.';
  }
  if (reason === 'SPAM') {
    return 'Live controls are unavailable while this listing is flagged for review.';
  }
  return 'Live controls are unavailable for this listing right now.';
}
