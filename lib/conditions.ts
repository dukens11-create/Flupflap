/**
 * eBay-style product condition options.
 *
 * GENERAL_CONDITIONS: fallback list shown when no category is selected.
 * CATEGORY_CONDITIONS: slug-prefix → condition overrides for specific categories.
 * getConditionsForSlug: returns the most specific matching list for a given slug.
 * ALL_CONDITIONS: union of all values, used for buyer-side filtering.
 */

export const GENERAL_CONDITIONS: string[] = [
  'New',
  'New with box',
  'New without box',
  'Open box',
  'Like new',
  'Excellent',
  'Very good',
  'Good',
  'Fair',
  'Used',
  'For parts / not working',
];

// Ordered from most specific (longest prefix) to least specific.
// getConditionsForSlug picks the longest matching prefix for a given slug.
const CATEGORY_CONDITIONS: Array<{ prefix: string; conditions: string[] }> = [
  // ── Electronics ──────────────────────────────────────────────────────────────
  {
    prefix: 'electronics',
    conditions: ['New', 'Open box', 'Refurbished', 'Used', 'For parts'],
  },
  // ── Perfume / Fragrance ───────────────────────────────────────────────────────
  {
    prefix: 'fashion-women-perfume',
    conditions: ['New sealed', 'New without box', 'Used (partially used)'],
  },
  {
    prefix: 'fashion-men-perfume',
    conditions: ['New sealed', 'New without box', 'Used (partially used)'],
  },
  // ── Shoes / Footwear ─────────────────────────────────────────────────────────
  {
    prefix: 'fashion-women-shoes',
    conditions: ['New with box', 'New without box', 'Pre-owned'],
  },
  {
    prefix: 'fashion-men-shoes',
    conditions: ['New with box', 'New without box', 'Pre-owned'],
  },
  {
    prefix: 'sports-footwear',
    conditions: ['New with box', 'New without box', 'Pre-owned'],
  },
  // ── Clothing / Fashion ────────────────────────────────────────────────────────
  {
    prefix: 'sports-clothing',
    conditions: ['New with tags', 'New without tags', 'Pre-owned'],
  },
  {
    prefix: 'fashion-women',
    conditions: ['New with tags', 'New without tags', 'Pre-owned'],
  },
  {
    prefix: 'fashion-men',
    conditions: ['New with tags', 'New without tags', 'Pre-owned'],
  },
  {
    prefix: 'fashion-kids',
    conditions: ['New with tags', 'New without tags', 'Pre-owned'],
  },
  {
    prefix: 'fashion-unisex',
    conditions: ['New with tags', 'New without tags', 'Pre-owned'],
  },
];

/**
 * Returns the most-specific condition list for a given category slug.
 * Falls back to GENERAL_CONDITIONS when no prefix matches.
 */
export function getConditionsForSlug(slug: string | null | undefined): string[] {
  if (!slug) return GENERAL_CONDITIONS;

  let best: string[] | null = null;
  let bestLen = 0;

  for (const { prefix, conditions } of CATEGORY_CONDITIONS) {
    if (
      (slug === prefix || slug.startsWith(prefix + '-')) &&
      prefix.length > bestLen
    ) {
      best = conditions;
      bestLen = prefix.length;
    }
  }

  return best ?? GENERAL_CONDITIONS;
}

/** Union of all condition values across every category (for buyer-side filtering). */
export const ALL_CONDITIONS: string[] = Array.from(
  new Set([
    ...GENERAL_CONDITIONS,
    ...CATEGORY_CONDITIONS.flatMap(c => c.conditions),
  ]),
);
