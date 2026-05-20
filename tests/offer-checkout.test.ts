import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOfferCheckoutIdempotencyKey,
  computeOfferCheckoutExpiry,
  validateOfferCheckoutAccess,
} from '@/lib/offer-checkout';

const acceptedOffer = {
  buyerId: 'buyer_1',
  status: 'ACCEPTED' as const,
  respondedAt: new Date('2026-01-01T00:00:00.000Z'),
  expiresAt: new Date('2026-01-04T00:00:00.000Z'),
  convertedOrderId: null,
};

test('accepted offer can proceed to checkout', () => {
  const result = validateOfferCheckoutAccess({
    offer: acceptedOffer,
    buyerId: 'buyer_1',
    now: new Date('2026-01-02T00:00:00.000Z'),
  });
  assert.deepEqual(result, { ok: true });
});

test('pending/rejected/expired offers cannot checkout', () => {
  const pending = validateOfferCheckoutAccess({
    offer: { ...acceptedOffer, status: 'PENDING' },
    buyerId: 'buyer_1',
  });
  const rejected = validateOfferCheckoutAccess({
    offer: { ...acceptedOffer, status: 'REJECTED' },
    buyerId: 'buyer_1',
  });
  const expired = validateOfferCheckoutAccess({
    offer: acceptedOffer,
    buyerId: 'buyer_1',
    now: new Date('2026-01-04T00:00:00.000Z'),
  });

  assert.equal(pending.ok, false);
  assert.equal(rejected.ok, false);
  assert.equal(expired.ok, false);
});

test('other users cannot checkout accepted offer', () => {
  const result = validateOfferCheckoutAccess({
    offer: acceptedOffer,
    buyerId: 'buyer_2',
  });
  assert.equal(result.ok, false);
});

test('idempotency key is stable for duplicate calls', () => {
  const first = buildOfferCheckoutIdempotencyKey({
    offerId: 'offer_1',
    pickupItemIds: ['prod_1'],
    selectedRateIds: ['rate_1', 'rate_2'],
    nonce: 'initial',
  });
  const second = buildOfferCheckoutIdempotencyKey({
    offerId: 'offer_1',
    pickupItemIds: ['prod_1'],
    selectedRateIds: ['rate_2', 'rate_1'],
    nonce: 'initial',
  });
  const changed = buildOfferCheckoutIdempotencyKey({
    offerId: 'offer_1',
    pickupItemIds: [],
    selectedRateIds: ['rate_2', 'rate_1'],
    nonce: 'initial',
  });

  assert.equal(first, second);
  assert.notEqual(first, changed);
});

test('accepted offer expiry is deterministically derived from response time', () => {
  const expiresAt = computeOfferCheckoutExpiry(new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(expiresAt.toISOString(), '2026-01-04T00:00:00.000Z');
});
