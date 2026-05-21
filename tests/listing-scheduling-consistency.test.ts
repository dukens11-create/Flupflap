import test from 'node:test';
import assert from 'node:assert/strict';
import { getSchedulingDisabledError, SCHEDULING_DISABLED_ERROR } from '@/lib/listing-scheduling';
import {
  SELLER_LISTINGS_NAV_ITEMS,
  SELLER_LISTINGS_SECTION_COPY,
  filterSellerListingsBySection,
} from '@/lib/seller-listings-config';
import type { SellerListingItem } from '@/components/SellerListingsGrid';

function makeListing(status: string, inventory: number): SellerListingItem {
  return {
    id: `${status}-${inventory}`,
    title: 'Sample',
    category: 'Category',
    condition: 'Good',
    priceCents: 1000,
    status,
    inventory,
    viewCount: 0,
    soldQty: 0,
    imageUrl: null,
    cartAdds: 0,
    isPromoted: false,
    promotionLabel: null,
    conversionRate: null,
    shippingIncomplete: false,
    packageSummary: null,
  };
}

test('scheduling submit action is explicitly rejected', () => {
  assert.equal(getSchedulingDisabledError('SCHEDULE'), SCHEDULING_DISABLED_ERROR);
});

test('non-scheduled submit actions are not rejected', () => {
  assert.equal(getSchedulingDisabledError('SAVE_DRAFT'), null);
  assert.equal(getSchedulingDisabledError('PUBLISH_NOW'), null);
  assert.equal(getSchedulingDisabledError(undefined), null);
});

test('seller listing navigation and sections no longer expose scheduled tab', () => {
  assert.equal(SELLER_LISTINGS_NAV_ITEMS.some((item) => item.key === 'scheduled'), false);
  assert.equal(Object.hasOwn(SELLER_LISTINGS_SECTION_COPY, 'scheduled'), false);
});

test('non-scheduled listing sections still filter correctly', () => {
  const listings: SellerListingItem[] = [
    makeListing('PENDING', 1),
    makeListing('REJECTED', 1),
    makeListing('APPROVED', 2),
    makeListing('ACTIVE', 3),
    makeListing('APPROVED', 0),
    makeListing('ACTIVE', 0),
    makeListing('SOLD', 0),
    makeListing('HIDDEN', 0),
    makeListing('SCHEDULED', 1),
  ];

  assert.equal(filterSellerListingsBySection(listings, 'drafts').length, 3);
  assert.equal(filterSellerListingsBySection(listings, 'active').length, 2);
  assert.equal(filterSellerListingsBySection(listings, 'sold').length, 1);
  assert.equal(filterSellerListingsBySection(listings, 'archived').length, 3);
});
