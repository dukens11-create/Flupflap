// Temporary compatibility list for existing databases that have not been
// backfilled with aliases[] yet. Keep in sync with seed aliases until all
// environments have migrated, then remove this fallback.
export const LEGACY_CATEGORY_ALIAS_FALLBACK: Record<string, string[]> = {
  'fashion-women-perfume': ['perfume', 'perfum', 'fragrance', 'cologne', 'body mist', 'scent'],
  electronics: ['electronic', 'electr', 'tech', 'gadgets'],
  'fashion-kids-clothing': ['clothing', 'cloth', 'clothes', 'apparel'],
  'sports-clothing': ['clothing', 'cloth', 'clothes', 'apparel'],
};

export function normalizeCategoryAliases(aliases?: string[] | string | null): string[] {
  const values = Array.isArray(aliases)
    ? aliases
    : typeof aliases === 'string'
      ? aliases.split(',')
      : [];

  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
