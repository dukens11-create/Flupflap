import { deriveGarageSaleLifecycle } from '@/lib/garage-sale-lifecycle';

type GarageSaleStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'HIDDEN';
type GarageSalePaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

type GarageSaleVisibilityInput = {
  status: GarageSaleStatus;
  paymentStatus: GarageSalePaymentStatus;
  isArchived?: boolean | null;
  isSpam?: boolean | null;
  startDate?: Date;
  endDate?: Date;
  isLive?: boolean;
};

export type GarageSaleVisibilityBlockReason =
  | 'ARCHIVED'
  | 'SPAM'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REFUNDED'
  | 'PAYMENT_UNPAID'
  | 'PENDING_REVIEW'
  | 'REJECTED'
  | 'UPCOMING'
  | 'EXPIRED'
  | 'HIDDEN'
  | 'UNKNOWN_STATUS'
  | null;

function getLifecycle(sale: GarageSaleVisibilityInput) {
  if (!sale.startDate || !sale.endDate || typeof sale.isLive !== 'boolean') return null;

  return deriveGarageSaleLifecycle({
    status: sale.status,
    paymentStatus: sale.paymentStatus,
    isArchived: Boolean(sale.isArchived),
    startDate: sale.startDate,
    endDate: sale.endDate,
    isLive: sale.isLive,
  });
}

export function isGarageSalePubliclyVisible(sale: GarageSaleVisibilityInput) {
  if (sale.isSpam) return false;
  const lifecycle = getLifecycle(sale);
  return lifecycle ? lifecycle.publiclyVisible : false;
}

export function getGarageSaleVisibilityBlockReason(sale: GarageSaleVisibilityInput): GarageSaleVisibilityBlockReason {
  const lifecycle = getLifecycle(sale);

  if (sale.isArchived) return 'ARCHIVED';
  if (sale.isSpam) return 'SPAM';
  if (sale.paymentStatus === 'PENDING') return 'PAYMENT_PENDING';
  if (sale.paymentStatus === 'FAILED') return 'PAYMENT_FAILED';
  if (sale.paymentStatus === 'REFUNDED') return 'PAYMENT_REFUNDED';
  if (sale.paymentStatus !== 'PAID') return 'PAYMENT_UNPAID';
  if (lifecycle?.state === 'UPCOMING') return 'UPCOMING';
  if (lifecycle?.state === 'EXPIRED') return 'EXPIRED';
  if (sale.status === 'PENDING') return 'PENDING_REVIEW';
  if (sale.status === 'REJECTED') return 'REJECTED';
  if (sale.status === 'HIDDEN') return 'HIDDEN';
  if (sale.status !== 'APPROVED') return 'UNKNOWN_STATUS';
  return null;
}

export function getGarageSaleLiveControlsBlockMessage(sale: GarageSaleVisibilityInput) {
  const reason = getGarageSaleVisibilityBlockReason(sale);
  if (reason === 'PAYMENT_PENDING') {
    return 'Live controls are unavailable while payment is pending. Your listing stays hidden until payment is confirmed.';
  }
  if (reason === 'PAYMENT_FAILED') {
    return 'Live controls are unavailable because payment failed for this listing.';
  }
  if (reason === 'PAYMENT_REFUNDED') {
    return 'Live controls are unavailable because this listing payment was refunded.';
  }
  if (reason === 'PAYMENT_UNPAID') {
    return 'Live controls are unavailable because payment is not completed for this listing.';
  }
  if (reason === 'PENDING_REVIEW') {
    return 'Your listing is pending review. Live controls are unavailable until an admin approves it.';
  }
  if (reason === 'REJECTED') {
    return 'Your listing was rejected. Update details and try again before using live controls.';
  }
  if (reason === 'UPCOMING') {
    return 'Live controls unlock when your sale start time arrives.';
  }
  if (reason === 'EXPIRED') {
    return 'Live controls are unavailable because this listing has expired.';
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
  if (reason === 'UNKNOWN_STATUS') {
    return 'Live controls are unavailable until this listing becomes visible.';
  }
  return 'Live controls are unavailable for this listing right now.';
}

export function getGarageSaleOwnerHiddenStatusMessage(sale: GarageSaleVisibilityInput) {
  const reason = getGarageSaleVisibilityBlockReason(sale);
  if (reason === 'PAYMENT_PENDING') {
    return 'Your payment is still pending. This listing is hidden and live controls are unavailable until payment is confirmed.';
  }
  if (reason === 'PAYMENT_FAILED') {
    return 'Payment failed for this listing. Repost and pay again to publish it.';
  }
  if (reason === 'PAYMENT_REFUNDED') {
    return 'Payment was refunded. This listing is no longer visible.';
  }
  if (reason === 'PAYMENT_UNPAID') {
    return 'Payment is not completed for this listing, so it is not visible to buyers.';
  }
  if (reason === 'PENDING_REVIEW') {
    return 'Your listing is pending review.';
  }
  if (reason === 'REJECTED') {
    return 'Your listing was rejected. Update details and try again.';
  }
  if (reason === 'UPCOMING') {
    return 'Your listing is visible and scheduled. Live controls unlock when your sale start time arrives.';
  }
  if (reason === 'EXPIRED') {
    return 'This listing has expired and is no longer visible.';
  }
  if (reason === 'HIDDEN') {
    return 'This listing is currently hidden.';
  }
  if (reason === 'ARCHIVED') {
    return 'This listing is archived and no longer visible.';
  }
  if (reason === 'SPAM') {
    return 'This listing is under review and currently hidden.';
  }
  if (reason === 'UNKNOWN_STATUS') {
    return 'This listing is not currently visible.';
  }
  return 'This listing is visible.';
}
