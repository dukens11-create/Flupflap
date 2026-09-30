import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAgentSaleEconomics, normalizeCurrency, normalizeIso2 } from '../lib/airtime-agent';

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
