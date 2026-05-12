export type RegionalMarketplace = {
  categoryId: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  subcategories: string[];
};

export const REGIONAL_MARKETPLACES: RegionalMarketplace[] = [
  {
    categoryId: 'caribbean-products',
    slug: 'caribbean-products',
    name: 'Caribbean Products',
    icon: '🏝️',
    description: 'Shop Caribbean culture, fashion, food, beauty, music, and more from trusted sellers.',
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
