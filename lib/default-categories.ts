import { PERFUME_SIZE_OPTIONS } from '@/lib/category-attribute-schema';
import { CULTURAL_MARKETPLACES } from '@/lib/cultural-marketplaces';
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
    sortOrder: 2,
    attributeSchema: ELECTRONICS_FIELDS,
    children: [
      node({ id: 'electronics-phones', name: 'Phones & Accessories', slug: 'electronics-phones', aliases: ['phones', 'phone', 'smartphones', 'accessories', 'chargers', 'cases'], parentId: 'electronics', level: 1, icon: '📱', sortOrder: 1, attributeSchema: PHONE_FIELDS }),
      node({ id: 'electronics-computers', name: 'Computers', slug: 'electronics-computers', aliases: ['computers', 'computer', 'laptops', 'desktops', 'pc'], parentId: 'electronics', level: 1, icon: '🖥️', sortOrder: 2, attributeSchema: COMPUTER_FIELDS, children: [
        node({ id: 'electronics-computers-laptops', name: 'Laptops', slug: 'electronics-computers-laptops', aliases: [], parentId: 'electronics-computers', level: 2, icon: null, sortOrder: 1, attributeSchema: COMPUTER_FIELDS }),
        node({ id: 'electronics-computers-desktops', name: 'Desktops', slug: 'electronics-computers-desktops', aliases: [], parentId: 'electronics-computers', level: 2, icon: null, sortOrder: 2, attributeSchema: COMPUTER_FIELDS }),
        node({ id: 'electronics-computers-tablets', name: 'Tablets', slug: 'electronics-computers-tablets', aliases: [], parentId: 'electronics-computers', level: 2, icon: null, sortOrder: 3, attributeSchema: COMPUTER_FIELDS }),
      ] }),
      node({ id: 'electronics-gaming', name: 'Gaming', slug: 'electronics-gaming', aliases: ['gaming', 'console', 'video games', 'gaming gear'], parentId: 'electronics', level: 1, icon: '🎮', sortOrder: 3, attributeSchema: ELECTRONICS_FIELDS, children: [
        node({ id: 'electronics-gaming-consoles', name: 'Consoles', slug: 'electronics-gaming-consoles', aliases: [], parentId: 'electronics-gaming', level: 2, icon: null, sortOrder: 1, attributeSchema: ELECTRONICS_FIELDS }),
        node({ id: 'electronics-gaming-games', name: 'Games', slug: 'electronics-gaming-games', aliases: [], parentId: 'electronics-gaming', level: 2, icon: null, sortOrder: 2, attributeSchema: ELECTRONICS_FIELDS }),
        node({ id: 'electronics-gaming-controllers', name: 'Controllers', slug: 'electronics-gaming-controllers', aliases: [], parentId: 'electronics-gaming', level: 2, icon: null, sortOrder: 3, attributeSchema: ELECTRONICS_FIELDS }),
      ] }),
      node({ id: 'electronics-cameras', name: 'Cameras', slug: 'electronics-cameras', aliases: [], parentId: 'electronics', level: 1, icon: null, sortOrder: 4, attributeSchema: ELECTRONICS_FIELDS }),
      node({ id: 'electronics-audio', name: 'Audio', slug: 'electronics-audio', aliases: [], parentId: 'electronics', level: 1, icon: null, sortOrder: 5, attributeSchema: ELECTRONICS_FIELDS }),
    ],
  }),
  node({ id: 'fashion', name: 'Fashion', slug: 'fashion', aliases: ['fashion', 'clothing', 'clothes', 'apparel', 'outfit', 'wear'], parentId: null, level: 0, icon: '👗', sortOrder: 1, attributeSchema: null, children: [
    node({ id: 'fashion-men', name: 'Men', slug: 'fashion-men', aliases: [], parentId: 'fashion', level: 1, icon: null, sortOrder: 1, attributeSchema: null, children: [
      node({ id: 'fashion-men-tshirts', name: 'T-Shirts', slug: 'fashion-men-tshirts', aliases: ['tshirts', 'tshirt', 't-shirt', 't shirt', 'tee', 'tee shirt', 'shirt'], parentId: 'fashion-men', level: 2, icon: null, sortOrder: 1, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-men-shoes', name: 'Shoes', slug: 'fashion-men-shoes', aliases: ['shoes', 'footwear', 'sneakers', 'boots', 'sandals'], parentId: 'fashion-men', level: 2, icon: '👟', sortOrder: 4, attributeSchema: SHOE_FIELDS }),
      node({ id: 'fashion-men-watches', name: 'Watches', slug: 'fashion-men-watches', aliases: [], parentId: 'fashion-men', level: 2, icon: null, sortOrder: 5, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-men-jackets', name: 'Jackets', slug: 'fashion-men-jackets', aliases: [], parentId: 'fashion-men', level: 2, icon: null, sortOrder: 6, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-men-shirts', name: 'Shirts', slug: 'fashion-men-shirts', aliases: [], parentId: 'fashion-men', level: 2, icon: null, sortOrder: 2, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-men-trousers', name: 'Pants', slug: 'fashion-men-trousers', aliases: ['pants', 'trousers'], parentId: 'fashion-men', level: 2, icon: null, sortOrder: 3, attributeSchema: CLOTHING_FIELDS }),
    ] }),
    node({ id: 'fashion-women', name: 'Women', slug: 'fashion-women', aliases: [], parentId: 'fashion', level: 1, icon: null, sortOrder: 2, attributeSchema: null, children: [
      node({ id: 'fashion-women-tops', name: 'Tops', slug: 'fashion-women-tops', aliases: [], parentId: 'fashion-women', level: 2, icon: null, sortOrder: 1, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-women-dresses', name: 'Dresses', slug: 'fashion-women-dresses', aliases: [], parentId: 'fashion-women', level: 2, icon: null, sortOrder: 2, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-women-pants', name: 'Pants', slug: 'fashion-women-pants', aliases: ['trousers'], parentId: 'fashion-women', level: 2, icon: null, sortOrder: 3, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-women-handbags', name: 'Handbags', slug: 'fashion-women-handbags', aliases: [], parentId: 'fashion-women', level: 2, icon: null, sortOrder: 5, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-women-perfume', name: 'Perfume & Fragrance', slug: 'fashion-women-perfume', aliases: ['perfume', 'fragrance', 'cologne', 'body mist', 'scent'], parentId: 'fashion-women', level: 2, icon: '🌸', sortOrder: 6, attributeSchema: PERFUME_FIELDS }),
      node({ id: 'fashion-women-shoes', name: 'Shoes', slug: 'fashion-women-shoes', aliases: ['shoes', 'footwear', 'heels', 'sneakers', 'sandals'], parentId: 'fashion-women', level: 2, icon: '👠', sortOrder: 4, attributeSchema: SHOE_FIELDS }),
      node({ id: 'fashion-women-jewelry', name: 'Jewelry', slug: 'fashion-women-jewelry', aliases: ['jewelry', 'jewellery', 'necklaces', 'bracelets', 'rings'], parentId: 'fashion-women', level: 2, icon: '💍', sortOrder: 7, attributeSchema: CLOTHING_FIELDS }),
    ] }),
    node({ id: 'fashion-kids', name: 'Kids', slug: 'fashion-kids', aliases: [], parentId: 'fashion', level: 1, icon: null, sortOrder: 3, attributeSchema: null, children: [
      node({ id: 'fashion-kids-tshirts', name: 'T-Shirts', slug: 'fashion-kids-tshirts', aliases: ['tshirts', 'tshirt', 't-shirt', 't shirt', 'tee', 'tee shirt', 'shirt'], parentId: 'fashion-kids', level: 2, icon: null, sortOrder: 1, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-kids-clothing', name: 'Clothing Sets', slug: 'fashion-kids-clothing', aliases: ['clothing', 'cloth', 'clothes', 'apparel', 'clothing sets'], parentId: 'fashion-kids', level: 2, icon: null, sortOrder: 2, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-kids-shoes', name: 'Shoes', slug: 'fashion-kids-shoes', aliases: ['shoes', 'kids shoes', 'sneakers', 'sandals'], parentId: 'fashion-kids', level: 2, icon: '👟', sortOrder: 3, attributeSchema: SHOE_FIELDS }),
    ] }),
    node({ id: 'fashion-unisex', name: 'Unisex', slug: 'fashion-unisex', aliases: [], parentId: 'fashion', level: 1, icon: null, sortOrder: 4, attributeSchema: null, children: [
      node({ id: 'fashion-unisex-hoodies', name: 'Hoodies', slug: 'fashion-unisex-hoodies', aliases: [], parentId: 'fashion-unisex', level: 2, icon: null, sortOrder: 1, attributeSchema: CLOTHING_FIELDS }),
      node({ id: 'fashion-unisex-accessories', name: 'Accessories', slug: 'fashion-unisex-accessories', aliases: [], parentId: 'fashion-unisex', level: 2, icon: null, sortOrder: 2, attributeSchema: CLOTHING_FIELDS }),
    ] }),
  ] }),
  node({ id: 'home', name: 'Home & Kitchen', slug: 'home', aliases: ['home', 'kitchen', 'household', 'home decor'], parentId: null, level: 0, icon: '🏠', sortOrder: 4, attributeSchema: null, children: [
    node({ id: 'home-furniture', name: 'Furniture', slug: 'home-furniture', aliases: [], parentId: 'home', level: 1, icon: null, sortOrder: 1, attributeSchema: FURNITURE_FIELDS }),
    node({ id: 'home-kitchen', name: 'Kitchen', slug: 'home-kitchen', aliases: [], parentId: 'home', level: 1, icon: null, sortOrder: 2, attributeSchema: FURNITURE_FIELDS }),
    node({ id: 'home-decor', name: 'Decor', slug: 'home-decor', aliases: [], parentId: 'home', level: 1, icon: null, sortOrder: 3, attributeSchema: FURNITURE_FIELDS }),
    node({ id: 'home-appliances', name: 'Appliances', slug: 'home-appliances', aliases: [], parentId: 'home', level: 1, icon: null, sortOrder: 4, attributeSchema: ELECTRONICS_FIELDS }),
    node({ id: 'home-garden', name: 'Garden', slug: 'home-garden', aliases: [], parentId: 'home', level: 1, icon: null, sortOrder: 5, attributeSchema: null }),
  ] }),
  node({ id: 'shoes', name: 'Shoes', slug: 'shoes', aliases: ['shoes', 'footwear', 'sneakers', 'boots', 'sandals', 'kicks'], parentId: null, level: 0, icon: '👟', sortOrder: 5, attributeSchema: SHOE_FIELDS, children: [
    node({ id: 'shoes-men', name: 'Men', slug: 'shoes-men', aliases: ['men shoes', 'mens shoes'], parentId: 'shoes', level: 1, icon: null, sortOrder: 1, attributeSchema: SHOE_FIELDS }),
    node({ id: 'shoes-women', name: 'Women', slug: 'shoes-women', aliases: ['women shoes', 'womens shoes'], parentId: 'shoes', level: 1, icon: null, sortOrder: 2, attributeSchema: SHOE_FIELDS }),
    node({ id: 'shoes-kids', name: 'Kids', slug: 'shoes-kids', aliases: ['kids shoes', 'children shoes'], parentId: 'shoes', level: 1, icon: null, sortOrder: 3, attributeSchema: SHOE_FIELDS }),
    node({ id: 'shoes-sneakers', name: 'Sneakers', slug: 'shoes-sneakers', aliases: ['sneakers', 'kicks', 'trainers'], parentId: 'shoes', level: 1, icon: null, sortOrder: 4, attributeSchema: SHOE_FIELDS }),
    node({ id: 'shoes-boots', name: 'Boots', slug: 'shoes-boots', aliases: ['boots'], parentId: 'shoes', level: 1, icon: null, sortOrder: 5, attributeSchema: SHOE_FIELDS }),
    node({ id: 'shoes-sandals', name: 'Sandals', slug: 'shoes-sandals', aliases: ['sandals', 'slides'], parentId: 'shoes', level: 1, icon: null, sortOrder: 6, attributeSchema: SHOE_FIELDS }),
  ] }),
  node({ id: 'beauty', name: 'Beauty & Cosmetics', slug: 'beauty', aliases: ['beauty', 'personal care', 'skincare', 'cosmetics', 'makeup', 'health beauty'], parentId: null, level: 0, icon: '💄', sortOrder: 3, attributeSchema: PERFUME_FIELDS, children: [
    node({ id: 'beauty-fragrance', name: 'Perfume & Fragrance', slug: 'beauty-fragrance', aliases: ['fragrance', 'perfume', 'cologne', 'scent', 'body mist'], parentId: 'beauty', level: 1, icon: '🌸', sortOrder: 1, attributeSchema: PERFUME_FIELDS, children: [
      node({ id: 'beauty-fragrance-perfume', name: 'Perfume', slug: 'beauty-fragrance-perfume', aliases: ['perfume', 'parfum', 'eau de parfum', 'edp', 'eau de toilette', 'edt', 'fragrance', 'cologne', 'scent', 'body mist'], parentId: 'beauty-fragrance', level: 2, icon: null, sortOrder: 1, attributeSchema: PERFUME_FIELDS }),
    ] }),
    node({ id: 'beauty-skincare', name: 'Skincare', slug: 'beauty-skincare', aliases: ['skincare', 'skin care', 'lotion', 'cream'], parentId: 'beauty', level: 1, icon: null, sortOrder: 2, attributeSchema: BEAUTY_SKINCARE_FIELDS }),
    node({ id: 'beauty-makeup', name: 'Makeup', slug: 'beauty-makeup', aliases: ['makeup', 'cosmetics', 'beauty products'], parentId: 'beauty', level: 1, icon: null, sortOrder: 3, attributeSchema: BEAUTY_SKINCARE_FIELDS }),
  ] }),
  node({ id: 'jewelry-watches', name: 'Jewelry & Watches', slug: 'jewelry-watches', aliases: ['jewelry', 'jewellery', 'watches', 'watch', 'rings', 'bracelets'], parentId: null, level: 0, icon: '💍', sortOrder: 6, attributeSchema: CLOTHING_FIELDS, children: [
    node({ id: 'jewelry-watches-jewelry', name: 'Jewelry', slug: 'jewelry-watches-jewelry', aliases: ['jewelry', 'jewellery', 'rings', 'bracelets', 'necklaces'], parentId: 'jewelry-watches', level: 1, icon: null, sortOrder: 1, attributeSchema: CLOTHING_FIELDS }),
    node({ id: 'jewelry-watches-watches', name: 'Watches', slug: 'jewelry-watches-watches', aliases: ['watches', 'watch'], parentId: 'jewelry-watches', level: 1, icon: null, sortOrder: 2, attributeSchema: CLOTHING_FIELDS }),
  ] }),
  node({ id: 'sports', name: 'Sports & Outdoors', slug: 'sports', aliases: ['sports', 'outdoors', 'fitness', 'camping'], parentId: null, level: 0, icon: '⚽', sortOrder: 7, attributeSchema: null, children: [
    node({ id: 'sports-equipment', name: 'Equipment', slug: 'sports-equipment', aliases: [], parentId: 'sports', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'sports-clothing', name: 'Clothing', slug: 'sports-clothing', aliases: ['clothing', 'cloth', 'clothes', 'apparel'], parentId: 'sports', level: 1, icon: null, sortOrder: 2, attributeSchema: CLOTHING_FIELDS }),
    node({ id: 'sports-footwear', name: 'Footwear', slug: 'sports-footwear', aliases: ['footwear', 'shoes', 'cleats'], parentId: 'sports', level: 1, icon: null, sortOrder: 3, attributeSchema: SHOE_FIELDS }),
    node({ id: 'sports-bikes', name: 'Bikes', slug: 'sports-bikes', aliases: [], parentId: 'sports', level: 1, icon: null, sortOrder: 4, attributeSchema: null }),
  ] }),
  node({ id: 'health-wellness', name: 'Health & Wellness', slug: 'health-wellness', aliases: ['health', 'wellness', 'self care', 'supplements'], parentId: null, level: 0, icon: '🧘', sortOrder: 8, attributeSchema: BEAUTY_SKINCARE_FIELDS, children: [
    node({ id: 'health-wellness-vitamins', name: 'Vitamins & Supplements', slug: 'health-wellness-vitamins', aliases: ['vitamins', 'supplements'], parentId: 'health-wellness', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'health-wellness-fitness', name: 'Fitness Recovery', slug: 'health-wellness-fitness', aliases: ['fitness recovery', 'wellness gear'], parentId: 'health-wellness', level: 1, icon: null, sortOrder: 2, attributeSchema: null }),
    node({ id: 'health-wellness-personal-care', name: 'Personal Care', slug: 'health-wellness-personal-care', aliases: ['personal care', 'wellness'], parentId: 'health-wellness', level: 1, icon: null, sortOrder: 3, attributeSchema: BEAUTY_SKINCARE_FIELDS }),
  ] }),
  node({ id: 'baby-kids', name: 'Baby & Kids', slug: 'baby-kids', aliases: ['baby', 'kids', 'children', 'toddlers'], parentId: null, level: 0, icon: '🍼', sortOrder: 9, attributeSchema: null, children: [
    node({ id: 'baby-kids-clothing', name: 'Clothing', slug: 'baby-kids-clothing', aliases: ['kids clothing', 'baby clothes'], parentId: 'baby-kids', level: 1, icon: null, sortOrder: 1, attributeSchema: CLOTHING_FIELDS }),
    node({ id: 'baby-kids-gear', name: 'Gear', slug: 'baby-kids-gear', aliases: ['stroller', 'car seat', 'baby gear'], parentId: 'baby-kids', level: 1, icon: null, sortOrder: 2, attributeSchema: null }),
    node({ id: 'baby-kids-toys', name: 'Toys', slug: 'baby-kids-toys', aliases: ['kids toys', 'baby toys'], parentId: 'baby-kids', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
  ] }),
  node({ id: 'vehicles', name: 'Automotive', slug: 'vehicles', aliases: ['automotive', 'cars', 'vehicles', 'auto parts'], parentId: null, level: 0, icon: '🚗', sortOrder: 10, attributeSchema: null, children: [
    node({ id: 'vehicles-cars', name: 'Cars', slug: 'vehicles-cars', aliases: [], parentId: 'vehicles', level: 1, icon: null, sortOrder: 1, attributeSchema: CAR_FIELDS, children: [
      node({ id: 'vehicles-trucks', name: 'Trucks', slug: 'vehicles-trucks', aliases: [], parentId: 'vehicles-cars', level: 2, icon: null, sortOrder: 1, attributeSchema: CAR_FIELDS }),
      node({ id: 'vehicles-suvs', name: 'SUVs', slug: 'vehicles-suvs', aliases: [], parentId: 'vehicles-cars', level: 2, icon: null, sortOrder: 2, attributeSchema: CAR_FIELDS }),
      node({ id: 'vehicles-sedans', name: 'Sedans', slug: 'vehicles-sedans', aliases: [], parentId: 'vehicles-cars', level: 2, icon: null, sortOrder: 3, attributeSchema: CAR_FIELDS }),
    ] }),
    node({ id: 'vehicles-motorcycles', name: 'Motorcycles', slug: 'vehicles-motorcycles', aliases: [], parentId: 'vehicles', level: 1, icon: null, sortOrder: 2, attributeSchema: CAR_FIELDS }),
    node({ id: 'vehicles-parts', name: 'Parts & Accessories', slug: 'vehicles-parts', aliases: [], parentId: 'vehicles', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
  ] }),
  node({ id: 'books', name: 'Books', slug: 'books', aliases: ['books', 'novels', 'reading'], parentId: null, level: 0, icon: '📚', sortOrder: 11, attributeSchema: null, children: [
    node({ id: 'books-fiction', name: 'Fiction', slug: 'books-fiction', aliases: [], parentId: 'books', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'books-nonfiction', name: 'Non-Fiction', slug: 'books-nonfiction', aliases: [], parentId: 'books', level: 1, icon: null, sortOrder: 2, attributeSchema: null }),
    node({ id: 'books-textbooks', name: 'Textbooks', slug: 'books-textbooks', aliases: [], parentId: 'books', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
    node({ id: 'books-comics', name: 'Comics & Manga', slug: 'books-comics', aliases: [], parentId: 'books', level: 1, icon: null, sortOrder: 4, attributeSchema: null }),
  ] }),
  node({ id: 'music', name: 'Music', slug: 'music', aliases: ['music', 'instruments', 'vinyl', 'records'], parentId: null, level: 0, icon: '🎵', sortOrder: 12, attributeSchema: null, children: [
    node({ id: 'music-instruments', name: 'Instruments', slug: 'music-instruments', aliases: ['instrument', 'guitar', 'keyboard'], parentId: 'music', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'music-records', name: 'Vinyl & Records', slug: 'music-records', aliases: ['vinyl', 'records', 'albums'], parentId: 'music', level: 1, icon: null, sortOrder: 2, attributeSchema: null }),
    node({ id: 'music-audio', name: 'Audio Gear', slug: 'music-audio', aliases: ['audio gear', 'speakers', 'microphones'], parentId: 'music', level: 1, icon: null, sortOrder: 3, attributeSchema: ELECTRONICS_FIELDS }),
  ] }),
  node({ id: 'toys', name: 'Toys', slug: 'toys', aliases: [], parentId: null, level: 0, icon: '🧸', sortOrder: 13, attributeSchema: null, children: [
    node({ id: 'toys-action-figures', name: 'Action Figures', slug: 'toys-action-figures', aliases: [], parentId: 'toys', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'toys-board-games', name: 'Board Games', slug: 'toys-board-games', aliases: [], parentId: 'toys', level: 1, icon: null, sortOrder: 2, attributeSchema: null }),
    node({ id: 'toys-building-sets', name: 'Building Sets', slug: 'toys-building-sets', aliases: [], parentId: 'toys', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
    node({ id: 'toys-dolls', name: 'Dolls', slug: 'toys-dolls', aliases: [], parentId: 'toys', level: 1, icon: null, sortOrder: 4, attributeSchema: null }),
  ] }),
  node({ id: 'handmade', name: 'Handmade', slug: 'handmade', aliases: ['handmade', 'artisan', 'crafted'], parentId: null, level: 0, icon: '🧶', sortOrder: 14, attributeSchema: null, children: [
    node({ id: 'handmade-home-decor', name: 'Home Decor', slug: 'handmade-home-decor', aliases: ['handmade decor', 'artisan decor'], parentId: 'handmade', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'handmade-fashion', name: 'Fashion Accessories', slug: 'handmade-fashion', aliases: ['handmade jewelry', 'handmade accessories'], parentId: 'handmade', level: 1, icon: null, sortOrder: 2, attributeSchema: CLOTHING_FIELDS }),
    node({ id: 'handmade-art', name: 'Art & Crafts', slug: 'handmade-art', aliases: ['art', 'crafts'], parentId: 'handmade', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
  ] }),
  node({ id: 'collectibles', name: 'Collectibles', slug: 'collectibles', aliases: [], parentId: null, level: 0, icon: '🏆', sortOrder: 15, attributeSchema: null, children: [
    node({ id: 'collectibles-coins', name: 'Coins', slug: 'collectibles-coins', aliases: [], parentId: 'collectibles', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'collectibles-memorabilia', name: 'Memorabilia', slug: 'collectibles-memorabilia', aliases: [], parentId: 'collectibles', level: 1, icon: null, sortOrder: 2, attributeSchema: null }),
    node({ id: 'collectibles-antiques', name: 'Antiques', slug: 'collectibles-antiques', aliases: [], parentId: 'collectibles', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
    node({ id: 'collectibles-cards', name: 'Trading Cards', slug: 'collectibles-cards', aliases: [], parentId: 'collectibles', level: 1, icon: null, sortOrder: 4, attributeSchema: null }),
  ] }),
  node({ id: 'grocery', name: 'Grocery', slug: 'grocery', aliases: ['grocery', 'food', 'pantry', 'snacks'], parentId: null, level: 0, icon: '🛒', sortOrder: 16, attributeSchema: null, children: [
    node({ id: 'grocery-pantry', name: 'Pantry Staples', slug: 'grocery-pantry', aliases: ['pantry', 'staples'], parentId: 'grocery', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'grocery-snacks', name: 'Snacks', slug: 'grocery-snacks', aliases: ['snacks'], parentId: 'grocery', level: 1, icon: null, sortOrder: 2, attributeSchema: null }),
    node({ id: 'grocery-beverages', name: 'Beverages', slug: 'grocery-beverages', aliases: ['beverages', 'drinks'], parentId: 'grocery', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
  ] }),
  node({ id: 'pet-supplies', name: 'Pet Supplies', slug: 'pet-supplies', aliases: ['pet supplies', 'pets', 'dog', 'cat'], parentId: null, level: 0, icon: '🐾', sortOrder: 17, attributeSchema: null, children: [
    node({ id: 'pet-supplies-dogs', name: 'Dogs', slug: 'pet-supplies-dogs', aliases: ['dog supplies'], parentId: 'pet-supplies', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'pet-supplies-cats', name: 'Cats', slug: 'pet-supplies-cats', aliases: ['cat supplies'], parentId: 'pet-supplies', level: 1, icon: null, sortOrder: 2, attributeSchema: null }),
    node({ id: 'pet-supplies-accessories', name: 'Accessories', slug: 'pet-supplies-accessories', aliases: ['pet accessories'], parentId: 'pet-supplies', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
  ] }),
  node({ id: 'tools-industrial', name: 'Tools & Industrial', slug: 'tools-industrial', aliases: ['tools', 'industrial', 'hardware'], parentId: null, level: 0, icon: '🛠️', sortOrder: 18, attributeSchema: null, children: [
    node({ id: 'tools-industrial-hand-tools', name: 'Hand Tools', slug: 'tools-industrial-hand-tools', aliases: ['hand tools'], parentId: 'tools-industrial', level: 1, icon: null, sortOrder: 1, attributeSchema: null }),
    node({ id: 'tools-industrial-power-tools', name: 'Power Tools', slug: 'tools-industrial-power-tools', aliases: ['power tools'], parentId: 'tools-industrial', level: 1, icon: null, sortOrder: 2, attributeSchema: null }),
    node({ id: 'tools-industrial-safety', name: 'Safety Gear', slug: 'tools-industrial-safety', aliases: ['safety gear', 'industrial safety'], parentId: 'tools-industrial', level: 1, icon: null, sortOrder: 3, attributeSchema: null }),
  ] }),
  node({ id: 'asian-products', name: 'Asian Products', slug: 'asian-products', aliases: [...ASIAN_PRODUCTS_ALIASES], parentId: null, level: 0, icon: '🌏', sortOrder: 19, attributeSchema: null, children: [
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
  ...CULTURAL_MARKETPLACES.map((marketplace) => node({
    id: marketplace.id,
    name: marketplace.name,
    slug: marketplace.slug,
    aliases: marketplace.aliases,
    parentId: null,
    level: 0,
    icon: marketplace.icon,
    sortOrder: marketplace.sortOrder,
    attributeSchema: null,
    children: marketplace.subcategories.map((subcategory, index) => node({
      id: subcategory.id,
      name: subcategory.name,
      slug: subcategory.slug,
      aliases: subcategory.aliases ?? [],
      parentId: marketplace.id,
      level: 1,
      icon: null,
      sortOrder: index + 1,
      attributeSchema: null,
    })),
  })),
];
