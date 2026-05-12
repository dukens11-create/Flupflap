export type RegionalMarketplace = {
  slug: string;
  name: string;
  icon: string;
  description: string;
  searchTerms: string[];
  subcategories: string[];
};

export const REGIONAL_MARKETPLACES: RegionalMarketplace[] = [
  {
    slug: 'caribbean-products',
    name: 'Caribbean Products',
    icon: '🏝️',
    description: 'Shop Caribbean culture, fashion, food, beauty, music, and more from trusted sellers.',
    searchTerms: ['caribbean', 'haitian', 'jamaican', 'dominican', 'trinidad', 'tobago'],
    subcategories: [
      'Haitian Products',
      'Jamaican Products',
      'Dominican Products',
      'Trinidad & Tobago Products',
      'Caribbean Fashion',
      'Caribbean Food & Snacks',
      'Caribbean Beauty & Hair',
      'Caribbean Art & Crafts',
      'Caribbean Flags & Accessories',
      'Caribbean Music & Culture',
    ],
  },
];

export function getRegionalMarketplaceBySlug(slug: string) {
  return REGIONAL_MARKETPLACES.find((marketplace) => marketplace.slug === slug) ?? null;
}
