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
  if (sale.isSpam) return false;
  if (sale.paymentStatus === 'FAILED' || sale.paymentStatus === 'REFUNDED') return false;
  if (sale.status === 'REJECTED' || sale.status === 'HIDDEN') return false;
  // Live sessions remain publicly visible even if the listing has been archived
  // (e.g. endDate passed mid-broadcast).  Archival only takes full effect once
  // the seller explicitly ends the live stream.
  if (sale.isLive) return true;
  if (sale.isArchived) return false;

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
  if (sale.isSpam) return 'SPAM';
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
    return 'Live controls unlock after admin review approves your garage sale.';
  }
  if (reason === 'REJECTED') {
    return 'Live controls are unavailable because this listing was rejected.';
  }
  if (reason === 'ARCHIVED' || reason === 'EXPIRED') {
    return 'Live controls are unavailable because this listing has ended. Repost it to go live again.';
  }
  if (reason === 'SPAM') {
    return 'Live controls are unavailable while this listing is under review.';
  }
  if (reason === 'HIDDEN') {
    return 'Live controls are unavailable while this listing is hidden.';
  }
  return 'You can go live when your garage sale is public and within its scheduled window.';
}

export function getGarageSaleOwnerHiddenStatusMessage(
  sale: GarageSaleVisibilityInput,
  reason = getGarageSaleVisibilityBlockReason(sale),
) {
  if (reason === 'PAYMENT_PENDING') {
    return 'Your garage sale is hidden until payment is confirmed.';
  }
  if (reason === 'PAYMENT_FAILED') {
    return 'Your payment failed, so this garage sale is hidden from other users.';
  }
  if (reason === 'PAYMENT_REFUNDED') {
    return 'This garage sale was refunded and is hidden from other users.';
  }
  if (reason === 'PENDING_REVIEW') {
    return 'Your garage sale is still under review and not visible to other users yet.';
  }
  if (reason === 'REJECTED') {
    return 'Your garage sale was rejected and is not visible to other users.';
  }
  if (reason === 'ARCHIVED') {
    return 'This garage sale is archived and hidden from other users.';
  }
  if (reason === 'EXPIRED') {
    return 'This garage sale has expired and is no longer visible to other users.';
  }
  if (reason === 'SPAM') {
    return 'This garage sale is under review and hidden from other users.';
  }
  if (reason === 'HIDDEN') {
    return 'This garage sale is hidden from other users.';
  }
  if (reason === 'UPCOMING') {
    return 'Your garage sale is scheduled and visible before it starts.';
  }
  return 'Your garage sale visibility is limited right now.';
}
