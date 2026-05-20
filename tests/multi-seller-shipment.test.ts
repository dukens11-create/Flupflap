import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isShipmentShipped,
  allSellersShipped,
  distinctSellerIds,
} from '@/lib/order-shipment';

// ── isShipmentShipped ────────────────────────────────────────────────────────

test('isShipmentShipped: LABEL_PURCHASED status is shipped', () => {
  assert.equal(isShipmentShipped({ shipmentStatus: 'LABEL_PURCHASED' }), true);
});

test('isShipmentShipped: PURCHASED status is shipped', () => {
  assert.equal(isShipmentShipped({ shipmentStatus: 'PURCHASED' }), true);
});

test('isShipmentShipped: SHIPPED_MANUAL status is shipped', () => {
  assert.equal(isShipmentShipped({ shipmentStatus: 'SHIPPED_MANUAL' }), true);
});

test('isShipmentShipped: presence of labelUrl counts as shipped', () => {
  assert.equal(
    isShipmentShipped({ shipmentStatus: 'RATE_QUOTED', labelUrl: 'https://example.com/label.pdf' }),
    true,
  );
});

test('isShipmentShipped: presence of trackingNumber counts as shipped', () => {
  assert.equal(
    isShipmentShipped({ shipmentStatus: null, trackingNumber: '1Z999AA1012345678' }),
    true,
  );
});

test('isShipmentShipped: RATE_QUOTED without artifacts is not shipped', () => {
  assert.equal(
    isShipmentShipped({ shipmentStatus: 'RATE_QUOTED', labelUrl: null, trackingNumber: null }),
    false,
  );
});

test('isShipmentShipped: PENDING_PURCHASE is not shipped', () => {
  assert.equal(isShipmentShipped({ shipmentStatus: 'PENDING_PURCHASE' }), false);
});

test('isShipmentShipped: PURCHASE_FAILED is not shipped', () => {
  assert.equal(isShipmentShipped({ shipmentStatus: 'PURCHASE_FAILED' }), false);
});

test('isShipmentShipped: null status without artifacts is not shipped', () => {
  assert.equal(isShipmentShipped({ shipmentStatus: null }), false);
});

// ── allSellersShipped ────────────────────────────────────────────────────────

test('allSellersShipped: single seller shipped returns true', () => {
  assert.equal(allSellersShipped(['seller_A'], ['seller_A']), true);
});

test('allSellersShipped: multi-seller all shipped returns true', () => {
  assert.equal(allSellersShipped(['seller_A', 'seller_B'], ['seller_A', 'seller_B']), true);
});

test('allSellersShipped: multi-seller partial ship returns false', () => {
  assert.equal(allSellersShipped(['seller_A', 'seller_B'], ['seller_A']), false);
});

test('allSellersShipped: multi-seller none shipped returns false', () => {
  assert.equal(allSellersShipped(['seller_A', 'seller_B'], []), false);
});

test('allSellersShipped: empty shippingSellerIds returns false (guard)', () => {
  // An order with no sellers requiring shipment should never be auto-marked SHIPPED.
  assert.equal(allSellersShipped([], ['seller_A']), false);
});

test('allSellersShipped: order of seller IDs does not matter', () => {
  assert.equal(allSellersShipped(['seller_B', 'seller_A'], ['seller_A', 'seller_B']), true);
});

test('allSellersShipped: extra shipped sellers (not in order) still returns true', () => {
  // If somehow an extra OrderShipment exists, it should not block the transition.
  assert.equal(allSellersShipped(['seller_A'], ['seller_A', 'seller_X']), true);
});

// ── distinctSellerIds ────────────────────────────────────────────────────────

test('distinctSellerIds: single item single seller', () => {
  const items = [{ product: { sellerId: 'seller_A' } }];
  const ids = distinctSellerIds(items);
  assert.deepEqual(ids, ['seller_A']);
});

test('distinctSellerIds: multiple items from same seller deduplicates', () => {
  const items = [
    { product: { sellerId: 'seller_A' } },
    { product: { sellerId: 'seller_A' } },
  ];
  const ids = distinctSellerIds(items);
  assert.deepEqual(ids, ['seller_A']);
});

test('distinctSellerIds: multi-seller items returns all unique IDs', () => {
  const items = [
    { product: { sellerId: 'seller_A' } },
    { product: { sellerId: 'seller_B' } },
    { product: { sellerId: 'seller_A' } },
  ];
  const ids = distinctSellerIds(items);
  assert.equal(ids.length, 2);
  assert.ok(ids.includes('seller_A'));
  assert.ok(ids.includes('seller_B'));
});

test('distinctSellerIds: empty items returns empty array', () => {
  assert.deepEqual(distinctSellerIds([]), []);
});

// ── Multi-seller checkout scenario ───────────────────────────────────────────

test('multi-seller order: status correctly computed across shipment segments', () => {
  // Simulate the state after seller A ships but seller B has not yet.
  const allSellers = ['seller_A', 'seller_B'];

  const shipments = [
    { sellerId: 'seller_A', shipmentStatus: 'LABEL_PURCHASED', labelUrl: 'https://example.com/a.pdf', trackingNumber: '1Z999' },
    { sellerId: 'seller_B', shipmentStatus: 'RATE_QUOTED', labelUrl: null, trackingNumber: null },
  ];

  const shippedSellerIds = shipments
    .filter((s) => isShipmentShipped(s))
    .map((s) => s.sellerId);

  // Only seller A has shipped — order should NOT be marked SHIPPED yet.
  assert.deepEqual(shippedSellerIds, ['seller_A']);
  assert.equal(allSellersShipped(allSellers, shippedSellerIds), false);
});

test('multi-seller order: status transitions to SHIPPED when both sellers ship', () => {
  const allSellers = ['seller_A', 'seller_B'];

  const shipmentA = { shipmentStatus: 'LABEL_PURCHASED', labelUrl: 'https://example.com/a.pdf', trackingNumber: '1Z999' };
  const shipmentB = { shipmentStatus: 'LABEL_PURCHASED', labelUrl: 'https://example.com/b.pdf', trackingNumber: '9400' };

  const shipments = [shipmentA, shipmentB];
  const shippedSellerIds = shipments
    .map((s, i) => ({ s, id: allSellers[i] }))
    .filter(({ s }) => isShipmentShipped(s))
    .map(({ id }) => id);

  assert.equal(allSellersShipped(allSellers, shippedSellerIds), true);
});

test('single-seller order: status transitions immediately when seller ships', () => {
  const allSellers = ['seller_A'];

  const shipmentA = { shipmentStatus: 'LABEL_PURCHASED', labelUrl: 'https://example.com/a.pdf', trackingNumber: '1Z999' };
  const shippedSellerIds = isShipmentShipped(shipmentA) ? allSellers : [];

  assert.equal(allSellersShipped(allSellers, shippedSellerIds), true);
});
