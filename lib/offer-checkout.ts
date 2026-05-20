const ACCEPTED_OFFER_TTL_HOURS = 72;

type OfferCheckoutState = {
  buyerId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  respondedAt: Date | null;
  expiresAt: Date | null;
  convertedOrderId: string | null;
};

export function computeOfferCheckoutExpiry(respondedAt: Date) {
  return new Date(respondedAt.getTime() + (ACCEPTED_OFFER_TTL_HOURS * 60 * 60 * 1000));
}

export function isOfferCheckoutExpired(offer: Pick<OfferCheckoutState, 'expiresAt'>, now = new Date()) {
  return !!offer.expiresAt && offer.expiresAt.getTime() <= now.getTime();
}

export function validateOfferCheckoutAccess({
  offer,
  buyerId,
  now = new Date(),
}: {
  offer: OfferCheckoutState | null;
  buyerId: string;
  now?: Date;
}): { ok: true } | { ok: false; message: string } {
  if (!offer || offer.buyerId !== buyerId) {
    return { ok: false, message: 'Offer not found.' };
  }

  if (offer.status !== 'ACCEPTED') {
    return { ok: false, message: 'Only accepted offers can be checked out.' };
  }

  if (isOfferCheckoutExpired(offer, now)) {
    return { ok: false, message: 'This accepted offer has expired.' };
  }

  if (offer.convertedOrderId) {
    return { ok: false, message: 'This accepted offer has already been paid.' };
  }

  return { ok: true };
}

export function buildOfferCheckoutIdempotencyKey({
  offerId,
  pickupItemIds,
  selectedRateIds,
  nonce,
}: {
  offerId: string;
  pickupItemIds: string[];
  selectedRateIds: string[];
  nonce?: string;
}) {
  const pickup = [...pickupItemIds].sort().join(',');
  const rates = [...selectedRateIds].sort().join(',');
  return `offer_checkout:${offerId}:pickup=${pickup}:rates=${rates}:nonce=${nonce ?? 'initial'}`;
}
