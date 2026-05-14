import {
  PrismaClient,
  Role,
  ProductStatus,
  SellerPhoneVerificationStatus,
  SellerVerificationStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PERFUME_SIZE_OPTIONS } from '@/lib/category-attribute-schema';
import { CULTURAL_MARKETPLACES } from '@/lib/cultural-marketplaces';
import { ASIAN_PRODUCTS_ALIASES } from '@/lib/marketplace-categories';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

// ── Category seed helpers ──────────────────────────────────────────────────────
type FieldDef = { name: string; label: string; type: 'text' | 'select' | 'number'; options?: string[] };

function fields(...defs: FieldDef[]) {
  return JSON.stringify(defs);
}

const ELECTRONICS_FIELDS = fields(
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'condition', label: 'Condition', type: 'select', options: ['New', 'Like New', 'Good', 'Fair', 'For Parts'] },
);
const PHONE_FIELDS = fields(
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'storage', label: 'Storage', type: 'select', options: ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'] },
  { name: 'condition', label: 'Condition', type: 'select', options: ['New', 'Like New', 'Good', 'Fair', 'For Parts'] },
);
const COMPUTER_FIELDS = fields(
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'storage', label: 'Storage', type: 'select', options: ['128GB', '256GB', '512GB', '1TB', '2TB'] },
  { name: 'ram', label: 'RAM', type: 'select', options: ['4GB', '8GB', '16GB', '32GB', '64GB'] },
  { name: 'condition', label: 'Condition', type: 'select', options: ['New', 'Like New', 'Good', 'Fair', 'For Parts'] },
);
const SHOE_FIELDS = fields(
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'size', label: 'Size', type: 'select', options: ['5', '6', '7', '8', '9', '10', '11', '12', '13'] },
  { name: 'color', label: 'Color', type: 'text' },
  { name: 'gender', label: 'Gender', type: 'select', options: ['Men', 'Women', 'Kids', 'Unisex'] },
);
const CLOTHING_FIELDS = fields(
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'size', label: 'Size', type: 'select', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { name: 'color', label: 'Color', type: 'text' },
  { name: 'gender', label: 'Gender', type: 'select', options: ['Men', 'Women', 'Kids', 'Unisex'] },
);
const PERFUME_FIELDS = fields(
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'size_ml', label: 'Size (ml)', type: 'select', options: [...PERFUME_SIZE_OPTIONS] },
  { name: 'fragrance_type', label: 'Fragrance Type', type: 'select', options: ['Floral', 'Woody', 'Fresh', 'Oriental', 'Citrus', 'Gourmand'] },
  { name: 'gender', label: 'Gender', type: 'select', options: ['Men', 'Women', 'Unisex'] },
);
const BEAUTY_SKINCARE_FIELDS = fields(
  { name: 'brand', label: 'Brand', type: 'text' },
  { name: 'skin_type', label: 'Skin Type', type: 'select', options: ['All Skin Types', 'Dry', 'Oily', 'Combination', 'Sensitive'] },
  { name: 'concern', label: 'Primary Concern', type: 'select', options: ['Hydration', 'Brightening', 'Acne', 'Anti-Aging', 'Soothing', 'Sun Care'] },
  { name: 'size_ml', label: 'Size (ml)', type: 'select', options: [...PERFUME_SIZE_OPTIONS] },
);
const CAR_FIELDS = fields(
  { name: 'brand', label: 'Brand / Make', type: 'text' },
  { name: 'year', label: 'Year', type: 'number' },
  { name: 'mileage', label: 'Mileage (miles)', type: 'number' },
  { name: 'transmission', label: 'Transmission', type: 'select', options: ['Automatic', 'Manual', 'CVT'] },
  { name: 'color', label: 'Color', type: 'text' },
);
const FURNITURE_FIELDS = fields(
  { name: 'material', label: 'Material', type: 'text' },
  { name: 'color', label: 'Color', type: 'text' },
  { name: 'brand', label: 'Brand', type: 'text' },
);

const ASIAN_SUBCATEGORY_DEFINITIONS = [
  { name: 'Asian Fashion', slug: 'asian-fashion', sortOrder: 1, schemaKey: 'clothing' },
  { name: 'Asian Beauty & Skincare', slug: 'asian-beauty-skincare', sortOrder: 2, schemaKey: 'beauty' },
  { name: 'Asian Food & Snacks', slug: 'asian-food-snacks', sortOrder: 3, schemaKey: null },
  { name: 'Asian Home Decor', slug: 'asian-home-decor', sortOrder: 4, schemaKey: 'furniture' },
  { name: 'Asian Electronics & Gadgets', slug: 'asian-electronics-gadgets', sortOrder: 5, schemaKey: 'electronics' },
  { name: 'Asian Art & Crafts', slug: 'asian-art-crafts', sortOrder: 6, schemaKey: null },
  { name: 'Asian Jewelry & Accessories', slug: 'asian-jewelry-accessories', sortOrder: 7, schemaKey: 'clothing' },
  { name: 'Asian Anime & Collectibles', slug: 'asian-anime-collectibles', sortOrder: 8, schemaKey: null },
  { name: 'Asian Books & Media', slug: 'asian-books-media', sortOrder: 9, schemaKey: null },
  { name: 'Asian Cultural Products', slug: 'asian-cultural-products', sortOrder: 10, schemaKey: null },
  { name: 'East Asian Products', slug: 'east-asian-products', sortOrder: 11, schemaKey: null },
  { name: 'South Asian Products', slug: 'south-asian-products', sortOrder: 12, schemaKey: null },
  { name: 'Southeast Asian Products', slug: 'southeast-asian-products', sortOrder: 13, schemaKey: null },
  { name: 'Central Asian Products', slug: 'central-asian-products', sortOrder: 14, schemaKey: null },
  { name: 'Middle Eastern & Western Asian Products', slug: 'middle-eastern-western-asian-products', sortOrder: 15, schemaKey: null },
] as const;

function resolveAsianAttributeSchema(
  schemaKey: (typeof ASIAN_SUBCATEGORY_DEFINITIONS)[number]['schemaKey'],
) {
  if (schemaKey === 'clothing') return CLOTHING_FIELDS;
  if (schemaKey === 'beauty') return BEAUTY_SKINCARE_FIELDS;
  if (schemaKey === 'furniture') return FURNITURE_FIELDS;
  if (schemaKey === 'electronics') return ELECTRONICS_FIELDS;
  return undefined;
}

async function seedCategories() {
  const categoryCount = await prisma.category.count();
  if (categoryCount > 0) return; // Already seeded

  // Main categories
  const electronics = await prisma.category.create({
    data: {
      name: 'Electronics',
      slug: 'electronics',
      aliases: ['electronics', 'electronic', 'electr', 'tech', 'gadgets'],
      level: 0,
      icon: '💻',
      sortOrder: 1,
      attributeSchema: ELECTRONICS_FIELDS,
    },
  });
  const fashion = await prisma.category.create({
    data: { name: 'Fashion', slug: 'fashion', level: 0, icon: '👗', sortOrder: 2 },
  });
  const home = await prisma.category.create({
    data: { name: 'Home', slug: 'home', level: 0, icon: '🏠', sortOrder: 3 },
  });
  const sports = await prisma.category.create({
    data: { name: 'Sports', slug: 'sports', level: 0, icon: '⚽', sortOrder: 4 },
  });
  const vehicles = await prisma.category.create({
    data: { name: 'Vehicles', slug: 'vehicles', level: 0, icon: '🚗', sortOrder: 5 },
  });
  const books = await prisma.category.create({
    data: { name: 'Books', slug: 'books', level: 0, icon: '📚', sortOrder: 6 },
  });
  const toys = await prisma.category.create({
    data: { name: 'Toys', slug: 'toys', level: 0, icon: '🧸', sortOrder: 7 },
  });
  const collectibles = await prisma.category.create({
    data: { name: 'Collectibles', slug: 'collectibles', level: 0, icon: '🏆', sortOrder: 8 },
  });
  const asianProducts = await prisma.category.create({
    data: {
      name: 'Asian Products',
      slug: 'asian-products',
      aliases: [...ASIAN_PRODUCTS_ALIASES],
      level: 0,
      icon: '🌏',
      sortOrder: 10,
    },
  });

  for (const marketplace of CULTURAL_MARKETPLACES) {
    const root = await prisma.category.create({
      data: {
        name: marketplace.name,
        slug: marketplace.slug,
        aliases: marketplace.aliases,
        level: 0,
        icon: marketplace.icon,
        sortOrder: marketplace.sortOrder,
      },
    });

    await prisma.category.createMany({
      data: marketplace.subcategories.map((subcategory, index) => ({
        name: subcategory.name,
        slug: subcategory.slug,
        aliases: subcategory.aliases ?? [],
        parentId: root.id,
        level: 1,
        sortOrder: index + 1,
      })),
    });
  }

  // Electronics subcategories
  const phones = await prisma.category.create({
    data: { name: 'Phones', slug: 'electronics-phones', parentId: electronics.id, level: 1, sortOrder: 1, attributeSchema: PHONE_FIELDS },
  });
  const computers = await prisma.category.create({
    data: { name: 'Computers', slug: 'electronics-computers', parentId: electronics.id, level: 1, sortOrder: 2, attributeSchema: COMPUTER_FIELDS },
  });
  const gaming = await prisma.category.create({
    data: { name: 'Gaming', slug: 'electronics-gaming', parentId: electronics.id, level: 1, sortOrder: 3, attributeSchema: ELECTRONICS_FIELDS },
  });
  const cameras = await prisma.category.create({
    data: { name: 'Cameras', slug: 'electronics-cameras', parentId: electronics.id, level: 1, sortOrder: 4, attributeSchema: ELECTRONICS_FIELDS },
  });
  const audio = await prisma.category.create({
    data: { name: 'Audio', slug: 'electronics-audio', parentId: electronics.id, level: 1, sortOrder: 5, attributeSchema: ELECTRONICS_FIELDS },
  });

  // Electronics → Computers children
  await prisma.category.createMany({ data: [
    { name: 'Laptops', slug: 'electronics-computers-laptops', parentId: computers.id, level: 2, sortOrder: 1, attributeSchema: COMPUTER_FIELDS },
    { name: 'Desktops', slug: 'electronics-computers-desktops', parentId: computers.id, level: 2, sortOrder: 2, attributeSchema: COMPUTER_FIELDS },
    { name: 'Tablets', slug: 'electronics-computers-tablets', parentId: computers.id, level: 2, sortOrder: 3, attributeSchema: COMPUTER_FIELDS },
  ]});

  // Electronics → Gaming children
  await prisma.category.createMany({ data: [
    { name: 'Consoles', slug: 'electronics-gaming-consoles', parentId: gaming.id, level: 2, sortOrder: 1, attributeSchema: ELECTRONICS_FIELDS },
    { name: 'Games', slug: 'electronics-gaming-games', parentId: gaming.id, level: 2, sortOrder: 2, attributeSchema: ELECTRONICS_FIELDS },
    { name: 'Controllers', slug: 'electronics-gaming-controllers', parentId: gaming.id, level: 2, sortOrder: 3, attributeSchema: ELECTRONICS_FIELDS },
  ]});

  // Fashion subcategories
  const men = await prisma.category.create({
    data: { name: 'Men', slug: 'fashion-men', parentId: fashion.id, level: 1, sortOrder: 1 },
  });
  const women = await prisma.category.create({
    data: { name: 'Women', slug: 'fashion-women', parentId: fashion.id, level: 1, sortOrder: 2 },
  });
  const kids = await prisma.category.create({
    data: { name: 'Kids', slug: 'fashion-kids', parentId: fashion.id, level: 1, sortOrder: 3 },
  });
  const unisex = await prisma.category.create({
    data: { name: 'Unisex', slug: 'fashion-unisex', parentId: fashion.id, level: 1, sortOrder: 4 },
  });

  // Fashion → Men children
  await prisma.category.createMany({ data: [
    { name: 'T-Shirts', slug: 'fashion-men-tshirts', aliases: ['tshirts', 't-shirt', 'tee'], parentId: men.id, level: 2, sortOrder: 1, attributeSchema: CLOTHING_FIELDS },
    { name: 'Shirts', slug: 'fashion-men-shirts', parentId: men.id, level: 2, sortOrder: 2, attributeSchema: CLOTHING_FIELDS },
    { name: 'Pants', slug: 'fashion-men-trousers', aliases: ['pants', 'trousers'], parentId: men.id, level: 2, sortOrder: 3, attributeSchema: CLOTHING_FIELDS },
    { name: 'Shoes', slug: 'fashion-men-shoes', parentId: men.id, level: 2, sortOrder: 4, attributeSchema: SHOE_FIELDS },
    { name: 'Watches', slug: 'fashion-men-watches', parentId: men.id, level: 2, sortOrder: 5, attributeSchema: CLOTHING_FIELDS },
    { name: 'Jackets', slug: 'fashion-men-jackets', parentId: men.id, level: 2, sortOrder: 6, attributeSchema: CLOTHING_FIELDS },
  ]});

  // Fashion → Women children
  await prisma.category.createMany({ data: [
    { name: 'Tops', slug: 'fashion-women-tops', parentId: women.id, level: 2, sortOrder: 1, attributeSchema: CLOTHING_FIELDS },
    { name: 'Dresses', slug: 'fashion-women-dresses', parentId: women.id, level: 2, sortOrder: 2, attributeSchema: CLOTHING_FIELDS },
    { name: 'Pants', slug: 'fashion-women-pants', aliases: ['trousers'], parentId: women.id, level: 2, sortOrder: 3, attributeSchema: CLOTHING_FIELDS },
    { name: 'Shoes', slug: 'fashion-women-shoes', parentId: women.id, level: 2, sortOrder: 4, attributeSchema: SHOE_FIELDS },
    { name: 'Handbags', slug: 'fashion-women-handbags', parentId: women.id, level: 2, sortOrder: 5, attributeSchema: CLOTHING_FIELDS },
    {
      name: 'Perfume & Fragrance',
      // Keep legacy slug to avoid breaking condition mappings tied to this category slug.
      slug: 'fashion-women-perfume',
      aliases: ['perfume', 'perfum', 'fragrance', 'cologne', 'body mist', 'scent'],
      parentId: women.id,
      level: 2,
      sortOrder: 6,
      attributeSchema: PERFUME_FIELDS,
    },
    { name: 'Jewelry', slug: 'fashion-women-jewelry', parentId: women.id, level: 2, sortOrder: 7, attributeSchema: CLOTHING_FIELDS },
  ]});

  // Fashion → Kids children
  await prisma.category.createMany({ data: [
    {
      name: 'T-Shirts',
      slug: 'fashion-kids-tshirts',
      aliases: ['tshirts', 't-shirt', 'tee'],
      parentId: kids.id,
      level: 2,
      sortOrder: 1,
      attributeSchema: CLOTHING_FIELDS,
    },
    {
      name: 'Clothing Sets',
      slug: 'fashion-kids-clothing',
      aliases: ['clothing', 'cloth', 'clothes', 'apparel', 'clothing sets'],
      parentId: kids.id,
      level: 2,
      sortOrder: 2,
      attributeSchema: CLOTHING_FIELDS,
    },
    { name: 'Shoes', slug: 'fashion-kids-shoes', parentId: kids.id, level: 2, sortOrder: 3, attributeSchema: SHOE_FIELDS },
  ]});

  // Fashion → Unisex children
  await prisma.category.createMany({ data: [
    { name: 'Hoodies', slug: 'fashion-unisex-hoodies', parentId: unisex.id, level: 2, sortOrder: 1, attributeSchema: CLOTHING_FIELDS },
    { name: 'Accessories', slug: 'fashion-unisex-accessories', parentId: unisex.id, level: 2, sortOrder: 2, attributeSchema: CLOTHING_FIELDS },
  ]});

  // Home subcategories
  await prisma.category.createMany({ data: [
    { name: 'Furniture', slug: 'home-furniture', parentId: home.id, level: 1, sortOrder: 1, attributeSchema: FURNITURE_FIELDS },
    { name: 'Kitchen', slug: 'home-kitchen', parentId: home.id, level: 1, sortOrder: 2, attributeSchema: FURNITURE_FIELDS },
    { name: 'Decor', slug: 'home-decor', parentId: home.id, level: 1, sortOrder: 3, attributeSchema: FURNITURE_FIELDS },
    { name: 'Appliances', slug: 'home-appliances', parentId: home.id, level: 1, sortOrder: 4, attributeSchema: ELECTRONICS_FIELDS },
    { name: 'Garden', slug: 'home-garden', parentId: home.id, level: 1, sortOrder: 5 },
  ]});

  // Sports subcategories
  await prisma.category.createMany({ data: [
    { name: 'Equipment', slug: 'sports-equipment', parentId: sports.id, level: 1, sortOrder: 1 },
    {
      name: 'Clothing',
      slug: 'sports-clothing',
      aliases: ['clothing', 'cloth', 'clothes', 'apparel'],
      parentId: sports.id,
      level: 1,
      sortOrder: 2,
      attributeSchema: CLOTHING_FIELDS,
    },
    { name: 'Footwear', slug: 'sports-footwear', parentId: sports.id, level: 1, sortOrder: 3, attributeSchema: SHOE_FIELDS },
    { name: 'Bikes', slug: 'sports-bikes', parentId: sports.id, level: 1, sortOrder: 4 },
  ]});

  // Vehicles subcategories
  const cars = await prisma.category.create({
    data: { name: 'Cars', slug: 'vehicles-cars', parentId: vehicles.id, level: 1, sortOrder: 1, attributeSchema: CAR_FIELDS },
  });
  await prisma.category.createMany({ data: [
    { name: 'Motorcycles', slug: 'vehicles-motorcycles', parentId: vehicles.id, level: 1, sortOrder: 2, attributeSchema: CAR_FIELDS },
    { name: 'Parts & Accessories', slug: 'vehicles-parts', parentId: vehicles.id, level: 1, sortOrder: 3 },
    { name: 'Trucks', slug: 'vehicles-trucks', parentId: cars.id, level: 2, sortOrder: 1, attributeSchema: CAR_FIELDS },
    { name: 'SUVs', slug: 'vehicles-suvs', parentId: cars.id, level: 2, sortOrder: 2, attributeSchema: CAR_FIELDS },
    { name: 'Sedans', slug: 'vehicles-sedans', parentId: cars.id, level: 2, sortOrder: 3, attributeSchema: CAR_FIELDS },
  ]});

  // Books subcategories
  await prisma.category.createMany({ data: [
    { name: 'Fiction', slug: 'books-fiction', parentId: books.id, level: 1, sortOrder: 1 },
    { name: 'Non-Fiction', slug: 'books-nonfiction', parentId: books.id, level: 1, sortOrder: 2 },
    { name: 'Textbooks', slug: 'books-textbooks', parentId: books.id, level: 1, sortOrder: 3 },
    { name: 'Comics & Manga', slug: 'books-comics', parentId: books.id, level: 1, sortOrder: 4 },
  ]});

  // Toys subcategories
  await prisma.category.createMany({ data: [
    { name: 'Action Figures', slug: 'toys-action-figures', parentId: toys.id, level: 1, sortOrder: 1 },
    { name: 'Board Games', slug: 'toys-board-games', parentId: toys.id, level: 1, sortOrder: 2 },
    { name: 'Building Sets', slug: 'toys-building-sets', parentId: toys.id, level: 1, sortOrder: 3 },
    { name: 'Dolls', slug: 'toys-dolls', parentId: toys.id, level: 1, sortOrder: 4 },
  ]});

  // Collectibles subcategories
  await prisma.category.createMany({ data: [
    { name: 'Coins', slug: 'collectibles-coins', parentId: collectibles.id, level: 1, sortOrder: 1 },
    { name: 'Memorabilia', slug: 'collectibles-memorabilia', parentId: collectibles.id, level: 1, sortOrder: 2 },
    { name: 'Antiques', slug: 'collectibles-antiques', parentId: collectibles.id, level: 1, sortOrder: 3 },
    { name: 'Trading Cards', slug: 'collectibles-cards', parentId: collectibles.id, level: 1, sortOrder: 4 },
  ]});

  // Asian Products subcategories
  await prisma.category.createMany({
    data: ASIAN_SUBCATEGORY_DEFINITIONS.map((category) => ({
      name: category.name,
      slug: category.slug,
      parentId: asianProducts.id,
      level: 1,
      sortOrder: category.sortOrder,
      attributeSchema: resolveAsianAttributeSchema(category.schemaKey),
    })),
  });

  // Silence TypeScript "unused variable" warnings for categories only used
  // as implicit references (their IDs are not used as parent for children)
  void phones; void cameras; void audio;

  console.log('Categories seeded.');
}

/**
 * Ensures the Beauty & Personal Care → Fragrance → Perfume category hierarchy
 * exists. Uses upsert so this is safe to run against existing databases that
 * were seeded before this hierarchy was added.
 */
async function ensureBeautyCategory() {
  const beauty = await prisma.category.upsert({
    where: { slug: 'beauty' },
    update: {},
    create: {
      name: 'Beauty & Personal Care',
      slug: 'beauty',
      aliases: ['beauty', 'personal care', 'skincare', 'cosmetics', 'makeup', 'health beauty'],
      level: 0,
      icon: '💄',
      sortOrder: 9,
      attributeSchema: JSON.parse(PERFUME_FIELDS),
    },
  });

  const fragrance = await prisma.category.upsert({
    where: { slug: 'beauty-fragrance' },
    update: {},
    create: {
      name: 'Fragrance',
      slug: 'beauty-fragrance',
      aliases: ['fragrance', 'perfume', 'cologne', 'scent', 'body mist'],
      parentId: beauty.id,
      level: 1,
      sortOrder: 1,
      attributeSchema: JSON.parse(PERFUME_FIELDS),
    },
  });

  await prisma.category.upsert({
    where: { slug: 'beauty-fragrance-perfume' },
    update: {},
    create: {
      name: 'Perfume',
      slug: 'beauty-fragrance-perfume',
      aliases: ['perfume', 'parfum', 'eau de parfum', 'edp', 'eau de toilette', 'edt', 'fragrance', 'cologne', 'scent', 'body mist'],
      parentId: fragrance.id,
      level: 2,
      sortOrder: 1,
      attributeSchema: JSON.parse(PERFUME_FIELDS),
    },
  });

  console.log('Beauty & Personal Care category hierarchy ensured.');
}

async function ensureFashionCategoryHierarchy() {
  const clothingSchema = JSON.parse(CLOTHING_FIELDS);
  const fashion = await prisma.category.upsert({
    where: { slug: 'fashion' },
    update: {
      name: 'Fashion',
      level: 0,
      icon: '👗',
      sortOrder: 2,
    },
    create: {
      name: 'Fashion',
      slug: 'fashion',
      level: 0,
      icon: '👗',
      sortOrder: 2,
    },
  });

  const men = await prisma.category.upsert({
    where: { slug: 'fashion-men' },
    update: {
      name: 'Men',
      parentId: fashion.id,
      level: 1,
      sortOrder: 1,
    },
    create: {
      name: 'Men',
      slug: 'fashion-men',
      parentId: fashion.id,
      level: 1,
      sortOrder: 1,
    },
  });

  await prisma.category.upsert({
    where: { slug: 'fashion-men-tshirts' },
    update: {
      name: 'T-Shirts',
      aliases: ['tshirts', 't-shirt', 'tee'],
      parentId: men.id,
      level: 2,
      sortOrder: 1,
      attributeSchema: clothingSchema,
    },
    create: {
      name: 'T-Shirts',
      slug: 'fashion-men-tshirts',
      aliases: ['tshirts', 't-shirt', 'tee'],
      parentId: men.id,
      level: 2,
      sortOrder: 1,
      attributeSchema: clothingSchema,
    },
  });

  await prisma.category.upsert({
    where: { slug: 'fashion-men-shirts' },
    update: {
      name: 'Shirts',
      parentId: men.id,
      level: 2,
      sortOrder: 2,
      attributeSchema: clothingSchema,
    },
    create: {
      name: 'Shirts',
      slug: 'fashion-men-shirts',
      parentId: men.id,
      level: 2,
      sortOrder: 2,
      attributeSchema: clothingSchema,
    },
  });

  console.log('Fashion > Men > T-Shirts hierarchy ensured.');
}

/**
 * Ensures the Asian Products category branch exists on existing databases.
 * Uses upsert so this can be safely re-run.
 */
async function ensureAsianCategory() {
  const asianProducts = await prisma.category.upsert({
    where: { slug: 'asian-products' },
    update: {},
    create: {
      name: 'Asian Products',
      slug: 'asian-products',
      aliases: [...ASIAN_PRODUCTS_ALIASES],
      level: 0,
      icon: '🌏',
      sortOrder: 10,
    },
  });

  for (const category of ASIAN_SUBCATEGORY_DEFINITIONS) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: {
        name: category.name,
        slug: category.slug,
        parentId: asianProducts.id,
        level: 1,
        sortOrder: category.sortOrder,
        attributeSchema: resolveAsianAttributeSchema(category.schemaKey),
      },
    });
  }

  console.log('Asian Products category hierarchy ensured.');
}

async function ensureCulturalMarketplaceCategories() {
  for (const marketplace of CULTURAL_MARKETPLACES) {
    const root = await prisma.category.upsert({
      where: { slug: marketplace.slug },
      update: {
        name: marketplace.name,
        aliases: marketplace.aliases,
        icon: marketplace.icon,
        sortOrder: marketplace.sortOrder,
      },
      create: {
        name: marketplace.name,
        slug: marketplace.slug,
        aliases: marketplace.aliases,
        level: 0,
        icon: marketplace.icon,
        sortOrder: marketplace.sortOrder,
      },
    });

    for (const [index, subcategory] of marketplace.subcategories.entries()) {
      await prisma.category.upsert({
        where: { slug: subcategory.slug },
        update: {
          name: subcategory.name,
          aliases: subcategory.aliases ?? [],
          parentId: root.id,
          level: 1,
          sortOrder: index + 1,
        },
        create: {
          name: subcategory.name,
          slug: subcategory.slug,
          aliases: subcategory.aliases ?? [],
          parentId: root.id,
          level: 1,
          sortOrder: index + 1,
        },
      });
    }
  }

  console.log('Cultural marketplace categories ensured.');
}
async function main(){
  const pass = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({ where:{email:'guest@flupflap.local'}, update:{}, create:{name:'Guest Buyer',email:'guest@flupflap.local',password:'',role:Role.CUSTOMER} });
  const admin = await prisma.user.upsert({ where:{email:'admin@flupflap.com'}, update:{}, create:{name:'FlupFlap Admin',email:'admin@flupflap.com',password:pass,role:Role.ADMIN} });
  const seller = await prisma.user.upsert({ where:{email:'seller@flupflap.com'}, update:{}, create:{name:'Demo Seller',email:'seller@flupflap.com',password:pass,role:Role.SELLER,phone:'+15005550006'} });
  await prisma.sellerVerification.upsert({
    where: { sellerId: seller.id },
    update: {
      status: SellerVerificationStatus.APPROVED,
      rejectionReason: null,
      phoneNumber: '+15005550006',
      phoneVerificationStatus: SellerPhoneVerificationStatus.VERIFIED,
      street: '123 Demo Street',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      country: 'US',
      governmentIdFrontPublicId: 'seed/government-id-front',
      governmentIdFrontFormat: 'jpg',
      governmentIdBackPublicId: 'seed/government-id-back',
      governmentIdBackFormat: 'jpg',
      selfieImagePublicId: 'seed/selfie',
      selfieImageFormat: 'jpg',
    },
    create: {
      sellerId: seller.id,
      status: SellerVerificationStatus.APPROVED,
      rejectionReason: null,
      phoneNumber: '+15005550006',
      phoneVerificationStatus: SellerPhoneVerificationStatus.VERIFIED,
      street: '123 Demo Street',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      country: 'US',
      governmentIdFrontPublicId: 'seed/government-id-front',
      governmentIdFrontFormat: 'jpg',
      governmentIdBackPublicId: 'seed/government-id-back',
      governmentIdBackFormat: 'jpg',
      selfieImagePublicId: 'seed/selfie',
      selfieImageFormat: 'jpg',
    },
  });
  // Seed categories first so products can reference them
  await seedCategories();
  // Always ensure new categories exist (safe upsert for existing databases)
  await ensureBeautyCategory();
  await ensureFashionCategoryHierarchy();
  await ensureAsianCategory();
  await ensureCulturalMarketplaceCategories();
  const count = await prisma.product.count();
  if(count===0){ await prisma.product.createMany({ data:[
    {title:'Used iPhone 13',description:'Clean used phone, unlocked, good battery.',priceCents:32900,condition:'Used',category:'Phones',imageUrl:'https://images.unsplash.com/photo-1592750475338-74b7b21085ab',status:ProductStatus.APPROVED,sellerId:seller.id,shippingCents:1299,inventory:1},
    {title:'New Wireless Headphones',description:'Brand new Bluetooth headphones with case.',priceCents:4900,condition:'New',category:'Audio',imageUrl:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e',status:ProductStatus.APPROVED,sellerId:seller.id,shippingCents:599,inventory:5},
    {title:'Used Office Chair',description:'Comfortable office chair in good condition.',priceCents:8500,condition:'Used',category:'Furniture',imageUrl:'https://images.unsplash.com/photo-1586023492125-27b2c045efd7',status:ProductStatus.APPROVED,sellerId:seller.id,shippingCents:2500,inventory:1}
  ]});}
  console.log({admin: admin.email, seller: seller.email, password:'password123'});
}
main().finally(()=>prisma.$disconnect());
