export type CulturalMarketplaceConfig = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  aliases: string[];
  sortOrder: number;
  featuredTitle: string;
  featuredSubtitle: string;
  subcategories: Array<{
    id: string;
    name: string;
    slug: string;
    aliases?: string[];
  }>;
};

export const CULTURAL_MARKETPLACES: ReadonlyArray<CulturalMarketplaceConfig> = [
  {
    id: 'african-products',
    name: 'African Products',
    slug: 'african-products',
    icon: '🌍',
    aliases: ['african', 'africa', 'african products', 'afro', 'cultural african'],
    sortOrder: 11,
    featuredTitle: 'Featured African Products',
    featuredSubtitle: 'Shop authentic fashion, food, art, and cultural essentials from African sellers.',
    subcategories: [
      { id: 'african-products-fashion', name: 'African Fashion', slug: 'african-products-fashion' },
      { id: 'african-products-fabrics-clothing', name: 'African Fabrics & Clothing', slug: 'african-products-fabrics-clothing' },
      { id: 'african-products-beauty-hair', name: 'African Beauty & Hair', slug: 'african-products-beauty-hair' },
      { id: 'african-products-jewelry-accessories', name: 'African Jewelry & Accessories', slug: 'african-products-jewelry-accessories' },
      { id: 'african-products-food-snacks', name: 'African Food & Snacks', slug: 'african-products-food-snacks' },
      { id: 'african-products-art-crafts', name: 'African Art & Crafts', slug: 'african-products-art-crafts' },
      { id: 'african-products-home-decor', name: 'African Home Decor', slug: 'african-products-home-decor' },
      { id: 'african-products-music-culture', name: 'African Music & Culture', slug: 'african-products-music-culture' },
      { id: 'african-products-books-media', name: 'African Books & Media', slug: 'african-products-books-media' },
      { id: 'african-products-flags-cultural', name: 'African Flags & Cultural Items', slug: 'african-products-flags-cultural' },
      { id: 'african-products-west-africa', name: 'West African Products', slug: 'african-products-west-africa' },
      { id: 'african-products-east-africa', name: 'East African Products', slug: 'african-products-east-africa' },
      { id: 'african-products-central-africa', name: 'Central African Products', slug: 'african-products-central-africa' },
      { id: 'african-products-north-africa', name: 'North African Products', slug: 'african-products-north-africa' },
      { id: 'african-products-southern-africa', name: 'Southern African Products', slug: 'african-products-southern-africa' },
    ],
  },
];
