import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGarageSaleCompensationAuditLine,
  buildGarageSaleCompensationSourceKey,
  formatGarageSaleCompensationSummary,
  isGarageSaleCompensationEligible,
  parseGarageSaleCompensationAudit,
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
    'garage_sale_early_end_compensation:sale_123',
  );
});

test('formatGarageSaleCompensationSummary includes a trimmed audit note', () => {
  assert.equal(
    formatGarageSaleCompensationSummary('system_cutoff', '  Seller lost final 20 minutes due to outage.  '),
    'Platform issue / system cutoff — Seller lost final 20 minutes due to outage.',
  );
});

test('parseGarageSaleCompensationAudit reads the latest stored compensation audit entry', () => {
  const firstEntry = buildGarageSaleCompensationAuditLine({
    reason: 'ended_early',
    note: 'Initial note',
    grantedBy: 'admin_1',
    sourceSale: 'sale_123',
    at: '2026-05-24T18:00:00.000Z',
    replacement: 'replacement_1',
  });
  const latestEntry = buildGarageSaleCompensationAuditLine({
    reason: 'system_cutoff',
    note: '  Seller live dropped after platform issue.  ',
    grantedBy: 'admin_2',
    sourceSale: 'sale_123',
    at: '2026-05-24T19:00:00.000Z',
    replacement: 'replacement_2',
  });

  assert.deepEqual(
    parseGarageSaleCompensationAudit(`Manual note\n${firstEntry}\n${latestEntry}`),
    {
      reason: 'system_cutoff',
      note: 'Seller live dropped after platform issue.',
      grantedBy: 'admin_2',
      sourceSale: 'sale_123',
      at: '2026-05-24T19:00:00.000Z',
      replacement: 'replacement_2',
    },
  );
});
