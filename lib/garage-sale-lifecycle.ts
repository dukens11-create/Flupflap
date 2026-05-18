type GarageSaleStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'HIDDEN';
type GarageSalePaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

type GarageSaleLifecycleInput = {
  status: GarageSaleStatus;
  paymentStatus: GarageSalePaymentStatus;
  isArchived: boolean;
  startDate: Date;
  endDate: Date;
  isLive: boolean;
};

export type GarageSaleLifecycleState =
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REFUNDED'
  | 'PENDING_REVIEW'
  | 'REJECTED'
  | 'HIDDEN'
  | 'EXPIRED'
  | 'LIVE'
  | 'OPEN'
  | 'UPCOMING';

export function deriveGarageSaleLifecycle(sale: GarageSaleLifecycleInput, now = new Date()) {
  const isExpired = sale.status === 'EXPIRED' || sale.isArchived || sale.endDate < now;
  const paymentPending = sale.paymentStatus === 'PENDING';
  const paymentFailed = sale.paymentStatus === 'FAILED';
  const paymentRefunded = sale.paymentStatus === 'REFUNDED';
  const paymentPaid = sale.paymentStatus === 'PAID';
  const startsInFuture = sale.startDate > now;
  const openNow = !startsInFuture && !isExpired;
  const publiclyVisible = sale.status === 'APPROVED' && paymentPaid && !isExpired;
  const sellerCanGoLive = publiclyVisible && !startsInFuture;

  let state: GarageSaleLifecycleState;
  if (paymentRefunded) {
    state = 'PAYMENT_REFUNDED';
  } else if (paymentFailed) {
    state = 'PAYMENT_FAILED';
  } else if (paymentPending) {
    state = 'PAYMENT_PENDING';
  } else if (sale.status === 'PENDING') {
    state = 'PENDING_REVIEW';
  } else if (sale.status === 'REJECTED') {
    state = 'REJECTED';
  } else if (isExpired) {
    state = 'EXPIRED';
  } else if (!publiclyVisible || sale.status === 'HIDDEN') {
    state = 'HIDDEN';
  } else if (sale.isLive) {
    state = 'LIVE';
  } else if (openNow) {
    state = 'OPEN';
  } else {
    state = 'UPCOMING';
  }

  return {
    state,
    publiclyVisible,
    sellerCanGoLive,
    openNow: publiclyVisible && openNow,
    ownerMessage: ownerLifecycleMessage(state),
  };
}

export function ownerLifecycleMessage(state: GarageSaleLifecycleState) {
  switch (state) {
    case 'PAYMENT_PENDING':
      return 'Payment is still processing. Your listing remains hidden until payment is confirmed.';
    case 'PAYMENT_FAILED':
      return 'Payment failed. Repost and pay again to publish this listing.';
    case 'PAYMENT_REFUNDED':
      return 'This listing payment was refunded and the sale is hidden.';
    case 'PENDING_REVIEW':
      return 'Your listing is pending admin review.';
    case 'REJECTED':
      return 'Your listing was rejected. Update details and submit again.';
    case 'EXPIRED':
      return 'Your listing has expired. Repost to make it active again.';
    case 'HIDDEN':
      return 'This listing is currently hidden.';
    case 'LIVE':
      return 'You are currently live.';
    case 'OPEN':
      return 'Your listing is active and visible to buyers.';
    case 'UPCOMING':
      return 'Your listing is visible and scheduled.';
    default:
      return 'Listing status unavailable.';
  }
}
