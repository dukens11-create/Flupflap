import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShippingPurchaseIdempotencyKey,
  classifyShippingPurchaseError,
  hasActivePurchasedLabel,
} from '@/lib/shipping-purchase';

test('deterministic idempotency key for same purchase intent', () => {
  const first = buildShippingPurchaseIdempotencyKey({
    orderId: 'order_1',
    shipmentId: 'shipment_1',
    rateId: 'rate_1',
  });
  const second = buildShippingPurchaseIdempotencyKey({
    orderId: 'order_1',
    shipmentId: 'shipment_1',
    rateId: 'rate_1',
  });
  const changed = buildShippingPurchaseIdempotencyKey({
    orderId: 'order_1',
    shipmentId: 'shipment_1',
    rateId: 'rate_2',
  });

  assert.equal(first, second);
  assert.notEqual(first, changed);
});

test('active purchased label is detected from persisted artifacts', () => {
  assert.equal(hasActivePurchasedLabel({
    shipmentStatus: 'RATE_QUOTED',
    labelUrl: null,
    trackingNumber: null,
  }), false);

  assert.equal(hasActivePurchasedLabel({
    shipmentStatus: 'LABEL_PURCHASED',
    labelUrl: null,
    trackingNumber: null,
  }), true);

  assert.equal(hasActivePurchasedLabel({
    shipmentStatus: 'RATE_QUOTED',
    labelUrl: 'https://labels.example/test.pdf',
    trackingNumber: null,
  }), true);
});

test('timeout/provider transient failures are marked retryable', () => {
  const timeout = classifyShippingPurchaseError(new Error('Shipping rate request timed out. Please try again.'));
  const unavailable = classifyShippingPurchaseError(new Error('Shippo request failed with 503'));
  const terminal = classifyShippingPurchaseError(new Error('Invalid rate selected'));

  assert.equal(timeout.retryable, true);
  assert.equal(unavailable.retryable, true);
  assert.equal(terminal.retryable, false);
});
