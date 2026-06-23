import test from 'node:test';
import assert from 'node:assert/strict';

import { INTIMATE_WELLNESS_CATEGORY, isAdultWellnessCategory } from '@/lib/adult-wellness';
import { buildProductSearchableText, searchTextMatchesQuery } from '@/lib/smart-search';

test('isAdultWellnessCategory detects the professional intimate wellness branch', () => {
  assert.equal(isAdultWellnessCategory({ categoryId: INTIMATE_WELLNESS_CATEGORY.id }), true);
  assert.equal(
    isAdultWellnessCategory({ categoryPath: 'Health & Wellness > Intimate Wellness > Personal Massagers' }),
    true,
  );
  assert.equal(isAdultWellnessCategory({ categoryName: 'Electronics' }), false);
});

test('smart search links intimate wellness products with common adult wellness queries', () => {
  const searchableText = buildProductSearchableText({
    title: 'Rechargeable personal massager',
    description: 'Quiet waterproof wellness device with storage pouch.',
    categoryName: 'Intimate Wellness',
    categoryPath: 'Health & Wellness > Intimate Wellness > Personal Massagers',
  });

  assert.equal(searchTextMatchesQuery(searchableText, 'adult wellness'), true);
  assert.equal(searchTextMatchesQuery(searchableText, 'sex toys'), true);
});
