import { PERFUME_SIZE_OPTIONS } from '@/lib/category-attribute-schema';
import { ASIAN_PRODUCTS_ALIASES } from '@/lib/marketplace-categories';

type FieldDef = {
  name: string;
  label: string;
  type: 'text' | 'select' | 'number';
  options?: string[];
};

export interface DefaultCategoryNode {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  parentId: string | null;
  level: number;
  icon: string | null;
  sortOrder: number;
  attributeSchema: FieldDef[] | null;
  children: DefaultCategoryNode[];
}

const ELECTRONICS_FIELDS: FieldDef[] = [
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'condition', label: 'Condition', type: 'select', options: ['New', 'Like New', 'Good', 'Fair', 'For Parts'] },
];
const PHONE_FIELDS: FieldDef[] = [
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'storage', label: 'Storage', type: 'select', options: ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'] },
  { name: 'condition', label: 'Condition', type: 'select', options: ['New', 'Like New', 'Good', 'Fair', 'For Parts'] },
];
const COMPUTER_FIELDS: FieldDef[] = [
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'storage', label: 'Storage', type: 'select', options: ['128GB', '256GB', '512GB', '1TB', '2TB'] },
  { name: 'ram', label: 'RAM', type: 'select', options: ['4GB', '8GB', '16GB', '32GB', '64GB'] },
  { name: 'condition', label: 'Condition', type: 'select', options: ['New', 'Like New', 'Good', 'Fair', 'For Parts'] },
];
const SHOE_FIELDS: FieldDef[] = [
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'size', label: 'Size', type: 'select', options: ['5', '6', '7', '8', '9', '10', '11', '12', '13'] },
  { name: 'color', label: 'Color', type: 'text' },
  { name: 'gender', label: 'Gender', type: 'select', options: ['Men', 'Women', 'Kids', 'Unisex'] },
];
const CLOTHING_FIELDS: FieldDef[] = [
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'size', label: 'Size', type: 'select', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { name: 'color', label: 'Color', type: 'text' },
  { name: 'gender', label: 'Gender', type: 'select', options: ['Men', 'Women', 'Kids', 'Unisex'] },
];
const PERFUME_FIELDS: FieldDef[] = [
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'size_ml', label: 'Size (ml)', type: 'select', options: [...PERFUME_SIZE_OPTIONS] },
  { name: 'fragrance_type', label: 'Fragrance Type', type: 'select', options: ['Floral', 'Woody', 'Fresh', 'Oriental', 'Citrus', 'Gourmand'] },
  { name: 'gender', label: 'Gender', type: 'select', options: ['Men', 'Women', 'Unisex'] },
];
const BEAUTY_SKINCARE_FIELDS: FieldDef[] = [
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'skin_type', label: 'Skin Type', type: 'select', options: ['All Skin Types', 'Dry', 'Oily', 'Combination', 'Sensitive'] },
  { name: 'concern', label: 'Primary Concern', type: 'select', options: ['Hydration', 'Brightening', 'Acne', 'Anti-Aging', 'Soothing', 'Sun Care'] },
  { name: 'size_ml', label: 'Size (ml)', type: 'select', options: [...PERFUME_SIZE_OPTIONS] },
];
const CAR_FIELDS: FieldDef[] = [
  { name: 'brand', label: 'Brand / Make', type: 'text' },
  { name: 'year', label: 'Year', type: 'number' },
  { name: 'mileage', label: 'Mileage (miles)', type: 'number' },
  { name: 'transmission', label: 'Transmission', type: 'select', options: ['Automatic', 'Manual', 'CVT'] },
  { name: 'color', label: 'Color', type: 'text' },
];
const FURNITURE_FIELDS: FieldDef[] = [
  { name: 'material', label: 'Material', type: 'text' },
  { name: 'color', label: 'Color', type: 'text' },
  { name: 'brand', label: 'Brand', type: 'text' },
];

function node(config: Omit<DefaultCategoryNode, 'children'> & { children?: DefaultCategoryNode[] }): DefaultCategoryNode {
  return { ...config, children: config.children ?? [] };
}

export const DEFAULT_CATEGORY_TREE: DefaultCategoryNode[] = [
  node({
    id: 'electronics',
    name: 'Electronics',
    slug: 'electronics',
    aliases: ['electronics', 'electronic', 'electr', 'tech', 'gadgets'],
    parentId: null,
    level: 0,
    icon: '💻',
    sortOrder: 1,
    attributeSchema: ELECTRONICS_FIELDS,
    children: [
      node({ id: 'electronics-phones', name: 'Phones', slug: 'electronics-phones', aliases: [], parentId: 'electronics', level: 1, icon: null, sortOrder: 1, attributeSchema: PHONE_FIELDS }),
      node({ id: 'electronics-computers', name: 'Computers', slug: 'electronics-computers', aliases: [], parentId: 'electronics', level: 1, icon: null, sortOrder: 2, attributeSchema: COMPUTER_FIELDS, children: [
        node({ id: 'electronics-computers-laptops', name: 'Laptops', slug: 'electronics-computers-laptops', aliases: [], parentId: 'electronics-computers', level: 2, icon: null, sortOrder: 1, attributeSchema: COMPUTER_FIELDS }),
        node({ id: 'electronics-computers-desktops', name: 'Desktops', slug: 'electronics-computers-desktops', aliases: [], parentId: 'electronics-computers', level: 2, icon: null, sortOrder: 2, attributeSchema: COMPUTER_FIELDS }),
        node({ id: 'electronics-computers-tablets', name: 'Tablets', slug: 'electronics-computers-tablets', aliases: [], parentId: 'electronics-computers', level: 2, icon: null, sortOrder: 3, attributeSchema: COMPUTER_FIELDS }),
      ] }),
      node({ id: 'electronics-gaming', name: 'Gaming', slug: 'electronics-gaming', aliases: [], parentId: 'electronics', level: 1, icon: null, sortOrder: 3, attributeSchema: ELECTRONICS_FIELDS, children: [
        node({ id: 'electronics-gaming-consoles', name: 'Consoles', slug: 'electronics-gaming-consoles', aliases: [], parentId: 'electronics-gaming', level: 2, icon: null, sortOrder: 1, attributeSchema: ELECTRONICS_FIELDS }),
        node({ id: 'electronics-gaming-games', name: 'Games', slug: 'electronics-gaming-games', aliases: [], parentId: 'electronics-gaming', level: 2, icon: null, sortOrder: 2, attributeSchema: ELECTRONICS_FIELDS }),
        node({ id: 'electronics-gaming-controllers', name: 'Controllers', slug: 'electronics-gaming-controllers', aliases: [], parentId: 'electronics-gaming', level: 2, icon: null, sortOrder: 3, attributeSchema: ELECTRONICS_FIELDS }),
      ] }),
      node({ id: 'electronics-cameras', name: 'Cameras', slug: 'electronics-cameras', aliases: [], parentId: 'electronics', level: 1, icon: null, sortOrder: 4, attributeSchema: ELECTRONICS_FIELDS }),
      node({ id: 'electronics-audio', name: 'Audio', slug: 'electronics-audio', aliases: [], parentId: 'electronics', level: 1, icon: null, sortOrder: 5, attributeSchema: ELECTRONICS_FIELDS }),
    ],
  }),
  node({ id: 'fashion', name: 'Fashion', slug: 'fashion', aliases: [], parentId: null, level: 0, icon: '👗', sortOrder: 2, attributeSchema: null, children: [
    node({ id: 'fashion-men', name: 'Men', slug: 'fashion-men', aliases: [], parentId: 'fashion', level: 1, icon: null, sortOrder: 1, attributeSchema: null, children: [
      node({ id: 'fashion-men-shoes', name: 'Shoes', slug: 'fashion-men-shoes', aliases: [], parentId: 'fashion-men', level: 2, icon: null, sortOrder: 1, attributeSchema: SHOE_FIELDS }),
      node({ id: 'fashion-men-watches', name: 'Watches', slug: 'fashion-men-watches', aliases: [], parentId: 'fashion-men', level: 2, icon: null, sortOrder: 2, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-men-jackets', name: 'Jackets', slug: 'fashion-men-jackets', aliases: [], parentId: 'fashion-men', level: 2, icon: null, sortOrder: 3, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-men-shirts', name: 'Shirts', slug: 'fashion-men-shirts', aliases: [], parentId: 'fashion-men', level: 2, icon: null, sortOrder: 4, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-men-trousers', name: 'Trousers', slug: 'fashion-men-trousers', aliases: [], parentId: 'fashion-men', level: 2, icon: null, sortOrder: 5, attributeSchema: CLOTHING_FIELDS }),
    ] }),
    node({ id: 'fashion-women', name: 'Women', slug: 'fashion-women', aliases: [], parentId: 'fashion', level: 1, icon: null, sortOrder: 2, attributeSchema: null, children: [
      node({ id: 'fashion-women-dresses', name: 'Dresses', slug: 'fashion-women-dresses', aliases: [], parentId: 'fashion-women', level: 2, icon: null, sortOrder: 1, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-women-handbags', name: 'Handbags', slug: 'fashion-women-handbags', aliases: [], parentId: 'fashion-women', level: 2, icon: null, sortOrder: 2, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-women-perfume', name: 'Perfume & Fragrance', slug: 'fashion-women-perfume', aliases: ['perfume', 'perfum', 'fragrance', 'cologne', 'body mist', 'scent'], parentId: 'fashion-women', level: 2, icon: null, sortOrder: 3, attributeSchema: PERFUME_FIELDS }),
      node({ id: 'fashion-women-shoes', name: 'Shoes', slug: 'fashion-women-shoes', aliases: [], parentId: 'fashion-women', level: 2, icon: null, sortOrder: 4, attributeSchema: SHOE_FIELDS }),
      node({ id: 'fashion-women-jewelry', name: 'Jewelry', slug: 'fashion-women-jewelry', aliases: [], parentId: 'fashion-women', level: 2, icon: null, sortOrder: 5, attributeSchema: CLOTHING_FIELDS }),
    ] }),
    node({ id: 'fashion-kids', name: 'Kids', slug: 'fashion-kids', aliases: [], parentId: 'fashion', level: 1, icon: null, sortOrder: 3, attributeSchema: null, children: [
      node({ id: 'fashion-kids-clothing', name: 'Clothing', slug: 'fashion-kids-clothing', aliases: ['clothing', 'cloth', 'clothes', 'apparel'], parentId: 'fashion-kids', level: 2, icon: null, sortOrder: 1, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-kids-shoes', name: 'Shoes', slug: 'fashion-kids-shoes', aliases: [], parentId: 'fashion-kids', level: 2, icon: null, sortOrder: 2, attributeSchema: SHOE_FIELDS }),
    ] }),
    node({ id: 'fashion-unisex', name: 'Unisex', slug: 'fashion-unisex', aliases: [], parentId: 'fashion', level: 1, icon: null, sortOrder: 4, attributeSchema: null, children: [
      node({ id: 'fashion-unisex-hoodies', name: 'Hoodies', slug: 'fashion-unisex-hoodies', aliases: [], parentId: 'fashion-unisex', level: 2, icon: null, sortOrder: 1, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-unisex-accessories', name: 'Accessories', slug: 'fashion-unisex-accessories', aliases: [], parentId: 'fashion-unisex', level: 2, icon: null, sortOrder: 2, attributeSchema: CLOTHING_FIELDS }),
    ] }),
  ] }),
  node({ id: 'home', name: 'Home', slug: 'home', aliases: [], parentId: null, level: 0, icon: '🏠', sortOrder: 3, attributeSchema: null, children: [
    node({ id: 'home-furniture', name: 'Furniture', slug: 'home-furniture', aliases: [], parentId: 'home', level: 1, icon: null, sortOrder: 1, attributeSchema: FURNITURE_FIELDS }),
    node({ id: 'home-kitchen', name: 'Kitchen', slug: 'home-kitchen', aliases: [], parentId: 'home', level: 1, icon: null, sortOrder: 2, attributeSchema: FURNITURE_FIELDS }),
    node({ id: 'home-decor', name: 'Decor', slug: 'home-decor', aliases: [], parentId: 'home', level: 1, icon: null, sortOrder: 3, attributeSchema: FURNITURE_FIELDS }),
    node({ id: 'home-appliances', name: 'Appliances', slug: 'home-appliances', aliases: [], parentId: 'home', level: 1, icon: null, sortOrder: 4, attributeSchema: ELECTRONICS_FIELDS }),
    node({ id: 'home-garden', name: 'Garden', slug: 'home-garden', aliases: [], parentId: 'home', level: 1, icon: null, sortOrder: 5, attributeSchema: null }),
  ] }),
  node({ id: 'sports', name: 'Sports', slug: 'sports', aliases: [], parentId: null, level: 0, icon: '⚽', sortOrder: 4, attributeSchema: null, children: [
    node({ id: 'sports-equipment', name: 'Equipment', slug: 'sports-equipment', aliases: [], parentId: 'sports', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'sports-clothing', name: 'Clothing', slug: 'sports-clothing', aliases: ['clothing', 'cloth', 'clothes', 'apparel'], parentId: 'sports', level: 1, icon: null, sortOrder: 2, attributeSchema: CLOTHING_FIELDS }),
    node({ id: 'sports-footwear', name: 'Footwear', slug: 'sports-footwear', aliases: [], parentId: 'sports', level: 1, icon: null, sortOrder: 3, attributeSchema: SHOE_FIELDS }),
    node({ id: 'sports-bikes', name: 'Bikes', slug: 'sports-bikes', aliases: [], parentId: 'sports', level: 1, icon: null, sortOrder: 4, attributeSchema: null }),
  ] }),
  node({ id: 'vehicles', name: 'Vehicles', slug: 'vehicles', aliases: [], parentId: null, level: 0, icon: '🚗', sortOrder: 5, attributeSchema: null, children: [
    node({ id: 'vehicles-cars', name: 'Cars', slug: 'vehicles-cars', aliases: [], parentId: 'vehicles', level: 1, icon: null, sortOrder: 1, attributeSchema: CAR_FIELDS, children: [
      node({ id: 'vehicles-trucks', name: 'Trucks', slug: 'vehicles-trucks', aliases: [], parentId: 'vehicles-cars', level: 2, icon: null, sortOrder: 1, attributeSchema: CAR_FIELDS }),
      node({ id: 'vehicles-suvs', name: 'SUVs', slug: 'vehicles-suvs', aliases: [], parentId: 'vehicles-cars', level: 2, icon: null, sortOrder: 2, attributeSchema: CAR_FIELDS }),
      node({ id: 'vehicles-sedans', name: 'Sedans', slug: 'vehicles-sedans', aliases: [], parentId: 'vehicles-cars', level: 2, icon: null, sortOrder: 3, attributeSchema: CAR_FIELDS }),
    ] }),
    node({ id: 'vehicles-motorcycles', name: 'Motorcycles', slug: 'vehicles-motorcycles', aliases: [], parentId: 'vehicles', level: 1, icon: null, sortOrder: 2, attributeSchema: CAR_FIELDS }),
    node({ id: 'vehicles-parts', name: 'Parts & Accessories', slug: 'vehicles-parts', aliases: [], parentId: 'vehicles', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
  ] }),
  node({ id: 'books', name: 'Books', slug: 'books', aliases: [], parentId: null, level: 0, icon: '📚', sortOrder: 6, attributeSchema: null, children: [
    node({ id: 'books-fiction', name: 'Fiction', slug: 'books-fiction', aliases: [], parentId: 'books', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'books-nonfiction', name: 'Non-Fiction', slug: 'books-nonfiction', aliases: [], parentId: 'books', level: 1, icon: null, sortOrder: 2, attributeSchema: null }),
    node({ id: 'books-textbooks', name: 'Textbooks', slug: 'books-textbooks', aliases: [], parentId: 'books', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
    node({ id: 'books-comics', name: 'Comics & Manga', slug: 'books-comics', aliases: [], parentId: 'books', level: 1, icon: null, sortOrder: 4, attributeSchema: null }),
  ] }),
  node({ id: 'toys', name: 'Toys', slug: 'toys', aliases: [], parentId: null, level: 0, icon: '🧸', sortOrder: 7, attributeSchema: null, children: [
    node({ id: 'toys-action-figures', name: 'Action Figures', slug: 'toys-action-figures', aliases: [], parentId: 'toys', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'toys-board-games', name: 'Board Games', slug: 'toys-board-games', aliases: [], parentId: 'toys', level: 1, icon: null, sortOrder: 2, attributeSchema: null }),
    node({ id: 'toys-building-sets', name: 'Building Sets', slug: 'toys-building-sets', aliases: [], parentId: 'toys', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
    node({ id: 'toys-dolls', name: 'Dolls', slug: 'toys-dolls', aliases: [], parentId: 'toys', level: 1, icon: null, sortOrder: 4, attributeSchema: null }),
  ] }),
  node({ id: 'collectibles', name: 'Collectibles', slug: 'collectibles', aliases: [], parentId: null, level: 0, icon: '🏆', sortOrder: 8, attributeSchema: null, children: [
    node({ id: 'collectibles-coins', name: 'Coins', slug: 'collectibles-coins', aliases: [], parentId: 'collectibles', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'collectibles-memorabilia', name: 'Memorabilia', slug: 'collectibles-memorabilia', aliases: [], parentId: 'collectibles', level: 1, icon: null, sortOrder: 2, attributeSchema: null }),
    node({ id: 'collectibles-antiques', name: 'Antiques', slug: 'collectibles-antiques', aliases: [], parentId: 'collectibles', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
    node({ id: 'collectibles-cards', name: 'Trading Cards', slug: 'collectibles-cards', aliases: [], parentId: 'collectibles', level: 1, icon: null, sortOrder: 4, attributeSchema: null }),
  ] }),
  node({ id: 'beauty', name: 'Beauty & Personal Care', slug: 'beauty', aliases: ['beauty', 'personal care', 'skincare', 'cosmetics', 'makeup', 'health beauty'], parentId: null, level: 0, icon: '💄', sortOrder: 9, attributeSchema: PERFUME_FIELDS, children: [
    node({ id: 'beauty-fragrance', name: 'Fragrance', slug: 'beauty-fragrance', aliases: ['fragrance', 'perfume', 'cologne', 'scent', 'body mist'], parentId: 'beauty', level: 1, icon: null, sortOrder: 1, attributeSchema: PERFUME_FIELDS, children: [
      node({ id: 'beauty-fragrance-perfume', name: 'Perfume', slug: 'beauty-fragrance-perfume', aliases: ['perfume', 'parfum', 'eau de parfum', 'edp', 'eau de toilette', 'edt', 'fragrance', 'cologne', 'scent', 'body mist'], parentId: 'beauty-fragrance', level: 2, icon: null, sortOrder: 1, attributeSchema: PERFUME_FIELDS }),
    ] }),
  ] }),
  node({ id: 'asian-products', name: 'Asian Products', slug: 'asian-products', aliases: [...ASIAN_PRODUCTS_ALIASES], parentId: null, level: 0, icon: '🌏', sortOrder: 10, attributeSchema: null, children: [
    node({ id: 'asian-fashion', name: 'Asian Fashion', slug: 'asian-fashion', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 1, attributeSchema: CLOTHING_FIELDS }),
    node({ id: 'asian-beauty-skincare', name: 'Asian Beauty & Skincare', slug: 'asian-beauty-skincare', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 2, attributeSchema: BEAUTY_SKINCARE_FIELDS }),
    node({ id: 'asian-food-snacks', name: 'Asian Food & Snacks', slug: 'asian-food-snacks', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
    node({ id: 'asian-home-decor', name: 'Asian Home Decor', slug: 'asian-home-decor', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 4, attributeSchema: FURNITURE_FIELDS }),
    node({ id: 'asian-electronics-gadgets', name: 'Asian Electronics & Gadgets', slug: 'asian-electronics-gadgets', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 5, attributeSchema: ELECTRONICS_FIELDS }),
    node({ id: 'asian-art-crafts', name: 'Asian Art & Crafts', slug: 'asian-art-crafts', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 6, attributeSchema: null }),
    node({ id: 'asian-jewelry-accessories', name: 'Asian Jewelry & Accessories', slug: 'asian-jewelry-accessories', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 7, attributeSchema: CLOTHING_FIELDS }),
    node({ id: 'asian-anime-collectibles', name: 'Asian Anime & Collectibles', slug: 'asian-anime-collectibles', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 8, attributeSchema: null }),
    node({ id: 'asian-books-media', name: 'Asian Books & Media', slug: 'asian-books-media', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 9, attributeSchema: null }),
    node({ id: 'asian-cultural-products', name: 'Asian Cultural Products', slug: 'asian-cultural-products', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 10, attributeSchema: null }),
    node({ id: 'east-asian-products', name: 'East Asian Products', slug: 'east-asian-products', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 11, attributeSchema: null }),
    node({ id: 'south-asian-products', name: 'South Asian Products', slug: 'south-asian-products', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 12, attributeSchema: null }),
    node({ id: 'southeast-asian-products', name: 'Southeast Asian Products', slug: 'southeast-asian-products', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 13, attributeSchema: null }),
    node({ id: 'central-asian-products', name: 'Central Asian Products', slug: 'central-asian-products', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 14, attributeSchema: null }),
    node({ id: 'middle-eastern-western-asian-products', name: 'Middle Eastern & Western Asian Products', slug: 'middle-eastern-western-asian-products', aliases: [], parentId: 'asian-products', level: 1, icon: null, sortOrder: 15, attributeSchema: null }),
  ] }),
];
