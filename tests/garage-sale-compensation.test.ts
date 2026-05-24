import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGarageSaleCompensationSourceKey,
  isGarageSaleCompensationEligible,
} from '@/lib/garage-sale-compensation';

function makeSale(overrides: Partial<Parameters<typeof isGarageSaleCompensationEligible>[0]> = {}) {
  const now = Date.now();
  return {
    isLive: false,
    isArchived: false,
    isSpam: false,
    status: 'APPROVED',
    paymentStatus: 'PAID',
    startDate: new Date(now - 60_000),
    endDate: new Date(now + 60_000),
    ...overrides,
  };
}

test('isGarageSaleCompensationEligible returns true for paid approved sale ended before scheduled window closes', () => {
  const sale = makeSale();
  assert.equal(isGarageSaleCompensationEligible(sale, new Date()), true);
});

test('isGarageSaleCompensationEligible returns false once scheduled window has already ended', () => {
  const sale = makeSale({ endDate: new Date(Date.now() - 1000) });
  assert.equal(isGarageSaleCompensationEligible(sale, new Date()), false);
});

test('isGarageSaleCompensationEligible returns false when session has not started yet', () => {
  const sale = makeSale({ startDate: new Date(Date.now() + 60_000) });
  assert.equal(isGarageSaleCompensationEligible(sale, new Date()), false);
});

test('buildGarageSaleCompensationSourceKey is deterministic per sale id', () => {
  assert.equal(
    buildGarageSaleCompensationSourceKey('sale_123'),
    'garage_sale_live_compensation:sale_123',
  );
});
