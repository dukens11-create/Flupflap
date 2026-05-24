/**
 * Tests for the perfume size_ml normalization and validation logic.
 *
 * These tests exercise:
 *  - Valid positive numbers with and without the 'ml' suffix.
 *  - Decimal values such as 1.5ml and 105.25ml.
 *  - Non-preset whole-number values such as 105ml.
 *  - Rejection of zero, negative, and non-numeric values.
 *  - Case-insensitive 'ML' suffix handling.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSizeMlValue } from '@/lib/category-attribute-schema';

test('normalizeSizeMlValue – preset values with ml suffix are accepted', () => {
  assert.equal(normalizeSizeMlValue('100ml'), '100ml');
  assert.equal(normalizeSizeMlValue('50ml'), '50ml');
  assert.equal(normalizeSizeMlValue('500ml'), '500ml');
});

test('normalizeSizeMlValue – plain positive number is normalized to Xml', () => {
  assert.equal(normalizeSizeMlValue('105'), '105ml');
  assert.equal(normalizeSizeMlValue('30'), '30ml');
  assert.equal(normalizeSizeMlValue('1000'), '1000ml');
});

test('normalizeSizeMlValue – decimal values are accepted', () => {
  assert.equal(normalizeSizeMlValue('1.5'), '1.5ml');
  assert.equal(normalizeSizeMlValue('1.5ml'), '1.5ml');
  assert.equal(normalizeSizeMlValue('105.25ml'), '105.25ml');
  assert.equal(normalizeSizeMlValue('0.5ml'), '0.5ml');
});

test('normalizeSizeMlValue – case-insensitive ML suffix', () => {
  assert.equal(normalizeSizeMlValue('100ML'), '100ml');
  assert.equal(normalizeSizeMlValue('50Ml'), '50ml');
});

test('normalizeSizeMlValue – trims whitespace', () => {
  assert.equal(normalizeSizeMlValue('  100ml  '), '100ml');
  assert.equal(normalizeSizeMlValue('  105  '), '105ml');
});

test('normalizeSizeMlValue – rejects zero', () => {
  assert.equal(normalizeSizeMlValue('0'), null);
  assert.equal(normalizeSizeMlValue('0ml'), null);
});

test('normalizeSizeMlValue – rejects negative values', () => {
  assert.equal(normalizeSizeMlValue('-5'), null);
  assert.equal(normalizeSizeMlValue('-1.5ml'), null);
});

test('normalizeSizeMlValue – rejects non-numeric text', () => {
  assert.equal(normalizeSizeMlValue('abc'), null);
  assert.equal(normalizeSizeMlValue('large'), null);
  assert.equal(normalizeSizeMlValue('100 ml extra'), null);
});

test('normalizeSizeMlValue – empty / null / undefined return null', () => {
  assert.equal(normalizeSizeMlValue(''), null);
  assert.equal(normalizeSizeMlValue(null), null);
  assert.equal(normalizeSizeMlValue(undefined), null);
});
