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
  | 'PENDING_REVIEW'
  | 'REJECTED'
  | 'UPCOMING'
  | 'EXPIRED'
  | 'HIDDEN'
  | 'UNKNOWN_STATUS'
  | null;

export type GarageSaleVisibilityTone = 'warning' | 'danger' | 'neutral';

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
  const reason = getGarageSaleVisibilityBlockReason(sale);
  return reason === null || reason === 'UPCOMING';
}

export function isGarageSalePubliclyOpenNow(sale: GarageSaleVisibilityInput) {
  const lifecycle = getLifecycle(sale);
  return isGarageSalePubliclyVisible(sale) && Boolean(lifecycle?.openNow);
}

export function getGarageSaleVisibilityBlockReason(
  sale: GarageSaleVisibilityInput,
  lifecycle = getLifecycle(sale),
): GarageSaleVisibilityBlockReason {

  if (sale.isArchived) return 'ARCHIVED';
  if (sale.isSpam && sale.status !== 'APPROVED') return 'SPAM';
  if (sale.paymentStatus === 'PENDING') return 'PAYMENT_PENDING';
  if (sale.paymentStatus === 'FAILED') return 'PAYMENT_FAILED';
  if (sale.paymentStatus === 'REFUNDED') return 'PAYMENT_REFUNDED';
  if (lifecycle?.state === 'UPCOMING') return 'UPCOMING';
  if (lifecycle?.state === 'EXPIRED') return 'EXPIRED';
  if (sale.status === 'PENDING') return 'PENDING_REVIEW';
  if (sale.status === 'REJECTED') return 'REJECTED';
  if (sale.status === 'HIDDEN') return 'HIDDEN';
  if (sale.status !== 'APPROVED') return 'UNKNOWN_STATUS';
  return null;
}

export function getGarageSaleVisibilityTone(reason: GarageSaleVisibilityBlockReason): GarageSaleVisibilityTone {
  if (reason === 'PAYMENT_PENDING' || reason === 'PENDING_REVIEW') {
    return 'warning';
  }
  if (reason === 'PAYMENT_FAILED' || reason === 'PAYMENT_REFUNDED' || reason === 'REJECTED') {
    return 'danger';
  }
  return 'neutral';
}

export function getGarageSaleLiveControlsBlockMessage(
  sale: GarageSaleVisibilityInput,
  reason = getGarageSaleVisibilityBlockReason(sale),
) {
  if (reason === 'PAYMENT_PENDING') {
    return 'Live controls are unavailable while payment is pending. Your listing stays hidden until payment is confirmed.';
  }
  if (reason === 'PAYMENT_FAILED') {
    return 'Live controls are unavailable because payment failed for this listing.';
  }
  if (reason === 'PAYMENT_REFUNDED') {
    return 'Live controls are unavailable because this listing payment was refunded.';
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
  return '';
}

export function getGarageSaleOwnerHiddenStatusMessage(
  sale: GarageSaleVisibilityInput,
  reason = getGarageSaleVisibilityBlockReason(sale),
) {
  if (reason === 'PAYMENT_PENDING') {
    return 'Your payment is still pending. This listing is hidden and live controls are unavailable until payment is confirmed.';
  }
  if (reason === 'PAYMENT_FAILED') {
    return 'Payment failed for this listing. Repost and pay again to publish it.';
  }
  if (reason === 'PAYMENT_REFUNDED') {
    return 'Payment was refunded. This listing is no longer visible.';
  }
  if (reason === 'PENDING_REVIEW') {
    return 'Your listing is pending review.';
  }
  if (reason === 'REJECTED') {
    return 'Your listing was rejected. Update details and try again.';
  }
  if (reason === 'UPCOMING') {
    return 'Your listing is scheduled. Live controls unlock when your sale start time arrives.';
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
  return '';
}
