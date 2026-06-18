import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductInventoryUpdateData } from '@/lib/order-fulfillment';

test('buildProductInventoryUpdateData marks listing sold when inventory reaches zero', () => {
  const soldOutAt = new Date('2026-06-18T00:00:00.000Z');
  const result = buildProductInventoryUpdateData(0, 2, soldOutAt);

  assert.equal(result.inventory, 0);
  assert.deepEqual(result.soldQty, { increment: 2 });
  assert.equal(result.status, 'SOLD');
  assert.equal(result.delistedAt, soldOutAt);
});

test('buildProductInventoryUpdateData preserves active listing fields when inventory remains', () => {
  const result = buildProductInventoryUpdateData(3, 1, new Date('2026-06-18T00:00:00.000Z'));

  assert.equal(result.inventory, 3);
  assert.deepEqual(result.soldQty, { increment: 1 });
  assert.equal('status' in result, false);
  assert.equal('delistedAt' in result, false);
});
