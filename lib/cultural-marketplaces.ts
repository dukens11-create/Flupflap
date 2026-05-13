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
    id: 'asian-products',
    name: 'Asian Products',
    slug: 'asian-products',
    icon: '🌏',
    aliases: ['asian', 'asia', 'asian products', 'east asian', 'south asian', 'southeast asian'],
    sortOrder: 10,
    featuredTitle: 'Featured Asian Products',
    featuredSubtitle: 'Shop authentic fashion, beauty, snacks, home decor, electronics, and cultural products.',
    subcategories: [
      { id: 'asian-fashion', name: 'Asian Fashion', slug: 'asian-fashion' },
      { id: 'asian-beauty-skincare', name: 'Asian Beauty & Skincare', slug: 'asian-beauty-skincare' },
      { id: 'asian-food-snacks', name: 'Asian Food & Snacks', slug: 'asian-food-snacks' },
      { id: 'asian-home-decor', name: 'Asian Home Decor', slug: 'asian-home-decor' },
      { id: 'asian-electronics-gadgets', name: 'Asian Electronics & Gadgets', slug: 'asian-electronics-gadgets' },
      { id: 'asian-art-crafts', name: 'Asian Art & Crafts', slug: 'asian-art-crafts' },
      { id: 'east-asian-products', name: 'East Asian Products', slug: 'east-asian-products' },
      { id: 'south-asian-products', name: 'South Asian Products', slug: 'south-asian-products' },
      { id: 'southeast-asian-products', name: 'Southeast Asian Products', slug: 'southeast-asian-products' },
    ],
  },
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
  {
    id: 'caribbean-products',
    name: 'Caribbean Products',
    slug: 'caribbean-products',
    icon: '🏝️',
    aliases: ['caribbean', 'caribbean products', 'island products', 'west indies'],
    sortOrder: 12,
    featuredTitle: 'Featured Caribbean Products',
    featuredSubtitle: 'Shop Caribbean culture, fashion, food, beauty, and more from trusted sellers.',
    subcategories: [
      { id: 'caribbean-products-haitian', name: 'Haitian Products', slug: 'caribbean-products-haitian', aliases: ['haitian', 'haiti', 'haitian products'] },
      { id: 'caribbean-products-jamaican', name: 'Jamaican Products', slug: 'caribbean-products-jamaican', aliases: ['jamaican', 'jamaica', 'jamaican products'] },
      { id: 'caribbean-products-dominican', name: 'Dominican Products', slug: 'caribbean-products-dominican', aliases: ['dominican', 'dominican republic', 'dominican products'] },
      { id: 'caribbean-products-trinidad-tobago', name: 'Trinidad & Tobago Products', slug: 'caribbean-products-trinidad-tobago', aliases: ['trinidad', 'tobago', 'trinidad and tobago', 'trinidad & tobago'] },
      { id: 'caribbean-products-fashion', name: 'Caribbean Fashion', slug: 'caribbean-products-fashion', aliases: ['caribbean fashion', 'island fashion'] },
      { id: 'caribbean-products-food-snacks', name: 'Caribbean Food & Snacks', slug: 'caribbean-products-food-snacks', aliases: ['caribbean food', 'caribbean snacks', 'island food'] },
      { id: 'caribbean-products-beauty-hair', name: 'Caribbean Beauty & Hair', slug: 'caribbean-products-beauty-hair', aliases: ['caribbean beauty', 'caribbean hair', 'island beauty'] },
      { id: 'caribbean-products-art-crafts', name: 'Caribbean Art & Crafts', slug: 'caribbean-products-art-crafts', aliases: ['caribbean art', 'caribbean crafts', 'island crafts'] },
      { id: 'caribbean-products-flags-accessories', name: 'Caribbean Flags & Accessories', slug: 'caribbean-products-flags-accessories', aliases: ['caribbean flags', 'flags', 'caribbean accessories'] },
      { id: 'caribbean-products-music-culture', name: 'Caribbean Music & Culture', slug: 'caribbean-products-music-culture', aliases: ['caribbean music', 'caribbean culture', 'island culture'] },
    ],
  },
];
