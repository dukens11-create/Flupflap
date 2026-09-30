import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateAgentSaleEconomics,
  classifyProviderTopupStatus,
  normalizeCurrency,
  normalizeIdempotencyKey,
  normalizeIso2,
  validateWalletAdjustment,
} from '../lib/airtime-agent';

test('agent sale economics deduct commission from wallet debit', () => {
  const result = calculateAgentSaleEconomics(10_00, 300);
  assert.equal(result.commissionCents, 30);
  assert.equal(result.debitCents, 970);
});

test('commission is bounded to prevent unsafe configuration', () => {
  const result = calculateAgentSaleEconomics(10_00, 90_000);
  assert.equal(result.commissionBps, 5000);
  assert.equal(result.debitCents, 500);
});

test('country and currency normalization are strict', () => {
  assert.equal(normalizeIso2(' ht '), 'HT');
  assert.equal(normalizeIso2('haiti'), null);
  assert.equal(normalizeCurrency(' usd '), 'USD');
  assert.equal(normalizeCurrency('US'), null);
});

test('idempotency keys reject short or unsafe values', () => {
  assert.equal(normalizeIdempotencyKey('sale-123456'), 'sale-123456');
  assert.equal(normalizeIdempotencyKey('short'), null);
  assert.equal(normalizeIdempotencyKey('bad key with spaces'), null);
});

test('provider status classification distinguishes success pending and failure', () => {
  assert.equal(classifyProviderTopupStatus('SUCCESSFUL'), 'SUCCESS');
  assert.equal(classifyProviderTopupStatus('PROCESSING'), 'PENDING');
  assert.equal(classifyProviderTopupStatus('FAILED'), 'FAILURE');
  assert.equal(classifyProviderTopupStatus(undefined), 'UNKNOWN');
  assert.equal(classifyProviderTopupStatus('unrecognized'), 'UNKNOWN');
});

test('wallet adjustments require non-zero integer cents', () => {
  assert.equal(validateWalletAdjustment(500), 500);
  assert.equal(validateWalletAdjustment(-200), -200);
  assert.equal(validateWalletAdjustment(0), null);
  assert.equal(validateWalletAdjustment(2.5), null);
  assert.equal(validateWalletAdjustment('bad'), null);
});
