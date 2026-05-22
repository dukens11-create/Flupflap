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
