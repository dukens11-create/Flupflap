// Temporary compatibility list for existing databases that have not been
// backfilled with aliases[] yet. Keep in sync with seed aliases until all
// environments have migrated, then remove this fallback.
export const LEGACY_CATEGORY_ALIAS_FALLBACK: Record<string, string[]> = {
  'fashion-men-tshirts': ['tshirts', 'tshirt', 't-shirt', 't shirt', 'tee', 'tee shirt', 'shirt'],
  'fashion-kids-tshirts': ['tshirts', 'tshirt', 't-shirt', 't shirt', 'tee', 'tee shirt', 'shirt'],
  'fashion-women-perfume': ['perfume', 'perfum', 'fragrance', 'cologne', 'body mist', 'scent'],
  electronics: ['electronic', 'electr', 'tech', 'gadgets'],
  'fashion-kids-clothing': ['clothing', 'cloth', 'clothes', 'apparel'],
  'sports-clothing': ['clothing', 'cloth', 'clothes', 'apparel'],
  beauty: ['beauty', 'personal care', 'skincare', 'cosmetics', 'makeup', 'health beauty'],
  'beauty-fragrance': ['fragrance', 'perfume', 'cologne', 'scent', 'body mist'],
  'beauty-fragrance-perfume': ['perfume', 'parfum', 'eau de parfum', 'edp', 'eau de toilette', 'edt', 'fragrance', 'cologne', 'scent', 'body mist'],
  'caribbean-products': ['caribbean', 'caribbean products', 'island products', 'west indies'],
  'caribbean-products-haitian': ['haitian', 'haiti', 'haitian products'],
  'caribbean-products-jamaican': ['jamaican', 'jamaica', 'jamaican products'],
  'caribbean-products-dominican': ['dominican', 'dominican republic', 'dominican products'],
  'caribbean-products-trinidad-tobago': ['trinidad', 'tobago', 'trinidad and tobago', 'trinidad & tobago'],
  'caribbean-products-fashion': ['caribbean fashion', 'island fashion'],
  'caribbean-products-food-snacks': ['caribbean food', 'caribbean snacks', 'island food'],
  'caribbean-products-beauty-hair': ['caribbean beauty', 'caribbean hair', 'island beauty'],
  'caribbean-products-art-crafts': ['caribbean art', 'caribbean crafts', 'island crafts'],
  'caribbean-products-flags-accessories': ['caribbean flags', 'flags', 'caribbean accessories'],
  'caribbean-products-music-culture': ['caribbean music', 'caribbean culture', 'island culture'],
};

export function normalizeCategoryAliases(aliases?: string[] | string | null): string[] {
  const values = Array.isArray(aliases)
    ? aliases
    : typeof aliases === 'string'
      ? aliases.split(',')
      : [];

  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
