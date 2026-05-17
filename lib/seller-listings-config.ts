import type { SellerListingItem } from '@/components/SellerListingsGrid';

export type SellerListingsSection = 'drafts' | 'scheduled' | 'active' | 'sold' | 'archived';

export const SELLER_LISTINGS_ROUTE_PREFIX = '/seller/listings';

export const SELLER_LISTINGS_NAV_ITEMS: Array<{
  key: SellerListingsSection | 'new';
  label: string;
  href: string;
}> = [
  { key: 'new', label: 'List Item', href: `${SELLER_LISTINGS_ROUTE_PREFIX}/new` },
  { key: 'drafts', label: 'Drafts', href: `${SELLER_LISTINGS_ROUTE_PREFIX}/drafts` },
  { key: 'scheduled', label: 'Scheduled', href: `${SELLER_LISTINGS_ROUTE_PREFIX}/scheduled` },
  { key: 'active', label: 'Active', href: `${SELLER_LISTINGS_ROUTE_PREFIX}/active` },
  { key: 'sold', label: 'Sold', href: `${SELLER_LISTINGS_ROUTE_PREFIX}/sold` },
  { key: 'archived', label: 'Archived', href: `${SELLER_LISTINGS_ROUTE_PREFIX}/archived` },
];

export const SELLER_LISTINGS_SECTION_COPY: Record<
  SellerListingsSection,
  {
    title: string;
    description: string;
    emptyMessage: string;
    searchPlaceholder: string;
  }
> = {
  drafts: {
    title: 'Drafts',
    description: 'Listings that still need approval or more work before they go live.',
    emptyMessage: 'No draft listings yet. Items waiting for approval or revisions will show here.',
    searchPlaceholder: 'Search draft listings…',
  },
  scheduled: {
    title: 'Scheduled',
    description: 'Listings scheduled to publish later will appear here.',
    emptyMessage: 'No scheduled listings yet.',
    searchPlaceholder: 'Search scheduled listings…',
  },
  active: {
    title: 'Active',
    description: 'Only your live listings that buyers can currently shop.',
    emptyMessage: 'No active listings right now.',
    searchPlaceholder: 'Search active listings…',
  },
  sold: {
    title: 'Sold',
    description: 'Completed sold listings and sold-only actions live here.',
    emptyMessage: 'No sold listings yet.',
    searchPlaceholder: 'Search sold listings…',
  },
  archived: {
    title: 'Archived',
    description: 'Delisted, hidden, and offline listings live here for reference.',
    emptyMessage: 'No archived listings right now.',
    searchPlaceholder: 'Search archived listings…',
  },
};

export function isSellerListingsSection(value: string): value is SellerListingsSection {
  return value in SELLER_LISTINGS_SECTION_COPY;
}

export function filterSellerListingsBySection(
  listings: SellerListingItem[],
  section: SellerListingsSection,
): SellerListingItem[] {
  if (section === 'drafts') {
    return listings.filter((item) => item.status === 'PENDING' || item.status === 'REJECTED');
  }
  if (section === 'scheduled') {
    return [];
  }
  if (section === 'active') {
    return listings.filter((item) => item.status === 'APPROVED' && item.inventory > 0);
  }
  if (section === 'sold') {
    return listings.filter((item) => item.status === 'SOLD');
  }
  return listings.filter(
    (item) => item.status === 'HIDDEN' || (item.status === 'APPROVED' && item.inventory === 0),
  );
}
