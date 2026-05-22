import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatVariantSelectionLabel,
  getAvailableVariantInventory,
  normalizeProductVariantsInput,
} from '../lib/product-variants';

test('normalizeProductVariantsInput parses valid clothing variants', () => {
  const result = normalizeProductVariantsInput(JSON.stringify([
    { sizeType: 'clothing', sizeLabel: 'M', quantity: 3, isAvailable: true },
    { sizeType: 'clothing', sizeLabel: 'L', quantity: 0, isAvailable: true },
  ]));
  assert.equal(result.error, null);
  assert.equal(result.sizeType, 'clothing');
  assert.equal(result.variants.length, 2);
  assert.equal(result.variants[0]?.isAvailable, true);
  assert.equal(result.variants[1]?.isAvailable, false);
});

test('normalizeProductVariantsInput requires waist and length for pants', () => {
  const result = normalizeProductVariantsInput(JSON.stringify([
    { sizeType: 'pants', waist: '32', quantity: 2, isAvailable: true },
  ]));
  assert.equal(result.error, 'Pants variants must include waist and length.');
});

test('getAvailableVariantInventory sums only available quantities', () => {
  const inventory = getAvailableVariantInventory([
    { quantity: 5, isAvailable: true },
    { quantity: 2, isAvailable: false },
    { quantity: 1, isAvailable: true },
  ]);
  assert.equal(inventory, 6);
});

test('formatVariantSelectionLabel formats pants and single-size labels', () => {
  assert.equal(
    formatVariantSelectionLabel({ waist: '32', length: '34', sizeLabel: null }),
    'Waist 32 / Length 34',
  );
  assert.equal(
    formatVariantSelectionLabel({ sizeLabel: 'XL', waist: null, length: null }),
    'XL',
  );
});

test('normalizeProductVariantsInput rejects empty array', () => {
  const result = normalizeProductVariantsInput(JSON.stringify([]));
  assert.equal(result.error, null);
  assert.equal(result.sizeType, null);
  assert.equal(result.variants.length, 0);
});

test('normalizeProductVariantsInput rejects mixed size types', () => {
  const result = normalizeProductVariantsInput(JSON.stringify([
    { sizeType: 'clothing', sizeLabel: 'M', quantity: 1, isAvailable: true },
    { sizeType: 'shoes', sizeLabel: '9', quantity: 1, isAvailable: true },
  ]));
  assert.equal(result.error, 'All size variants must use the same size format.');
});

test('normalizeProductVariantsInput handles all size types', () => {
  for (const sizeType of ['baby', 'clothing', 'shoes', 'dress'] as const) {
    const result = normalizeProductVariantsInput(JSON.stringify([
      { sizeType, sizeLabel: 'test', quantity: 2, isAvailable: true },
    ]));
    assert.equal(result.error, null, `expected no error for ${sizeType}`);
    assert.equal(result.sizeType, sizeType);
  }
});

test('normalizeProductVariantsInput parses pants with waist and length', () => {
  const result = normalizeProductVariantsInput(JSON.stringify([
    { sizeType: 'pants', waist: '32', length: '30', quantity: 4, isAvailable: true },
    { sizeType: 'pants', waist: '34', length: '32', quantity: 0, isAvailable: true },
  ]));
  assert.equal(result.error, null);
  assert.equal(result.sizeType, 'pants');
  assert.equal(result.variants.length, 2);
  assert.equal(result.variants[0]?.isAvailable, true);
  assert.equal(result.variants[1]?.isAvailable, false);
});

test('normalizeProductVariantsInput deduplicates repeated size labels', () => {
  const result = normalizeProductVariantsInput(JSON.stringify([
    { sizeType: 'clothing', sizeLabel: 'M', quantity: 3, isAvailable: true },
    { sizeType: 'clothing', sizeLabel: 'M', quantity: 2, isAvailable: true },
  ]));
  assert.equal(result.error, null);
  assert.equal(result.variants.length, 1);
});

test('getAvailableVariantInventory returns 0 when all variants unavailable', () => {
  const inventory = getAvailableVariantInventory([
    { quantity: 5, isAvailable: false },
    { quantity: 3, isAvailable: false },
  ]);
  assert.equal(inventory, 0);
});

test('getAvailableVariantInventory returns 0 for empty variants', () => {
  assert.equal(getAvailableVariantInventory([]), 0);
});

test('normalizeProductVariantsInput marks variant unavailable when quantity is 0', () => {
  const result = normalizeProductVariantsInput(JSON.stringify([
    { sizeType: 'clothing', sizeLabel: 'S', quantity: 0, isAvailable: true },
  ]));
  assert.equal(result.error, null);
  assert.equal(result.variants[0]?.isAvailable, false);
});

test('normalizeProductVariantsInput returns null for no input', () => {
  assert.deepEqual(normalizeProductVariantsInput(null), { variants: [], sizeType: null, error: null });
  assert.deepEqual(normalizeProductVariantsInput(undefined), { variants: [], sizeType: null, error: null });
  assert.deepEqual(normalizeProductVariantsInput(''), { variants: [], sizeType: null, error: null });
});
