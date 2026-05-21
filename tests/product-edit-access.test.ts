import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canDeleteProductFromEdit,
  canEditProductForSeller,
  getProductEditCancelPath,
  getProductEditDraftPath,
  getProductEditSuccessPath,
} from '@/lib/product-edit-access';

test('sellers can only edit their own products, while admins can edit any product', () => {
  assert.equal(canEditProductForSeller('SELLER', 'seller-1', 'seller-1'), true);
  assert.equal(canEditProductForSeller('SELLER', 'seller-1', 'seller-2'), false);
  assert.equal(canEditProductForSeller('ADMIN', 'admin-1', 'seller-2'), true);
});

test('edit navigation paths stay in the correct workspace for each role', () => {
  assert.equal(getProductEditCancelPath('SELLER'), '/seller');
  assert.equal(getProductEditCancelPath('ADMIN'), '/admin');
  assert.equal(getProductEditDraftPath('SELLER'), '/seller?updated=1');
  assert.equal(getProductEditDraftPath('ADMIN'), '/admin');
  assert.equal(getProductEditSuccessPath('SELLER', 'prod-1', true), '/seller/listings/drafts?updated=prod-1&fraud=review');
  assert.equal(getProductEditSuccessPath('ADMIN', 'prod-1', true), '/admin');
});

test('delete from edit form remains seller-only and excludes sold items', () => {
  assert.equal(canDeleteProductFromEdit('SELLER', 'ACTIVE'), true);
  assert.equal(canDeleteProductFromEdit('SELLER', 'SOLD'), false);
  assert.equal(canDeleteProductFromEdit('ADMIN', 'ACTIVE'), false);
});
