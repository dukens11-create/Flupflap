import type { PrismaClient } from '@prisma/client';

type CategoryWriter = Pick<PrismaClient, 'category'>;

/**
 * Ensures the Fashion > Men > T-Shirts branch exists for environments that
 * have not run the latest seed script yet. Safe to call repeatedly.
 */
export async function ensureFashionCategoryHierarchy(db: CategoryWriter) {
  const fashion = await db.category.upsert({
    where: { slug: 'fashion' },
    update: {
      name: 'Fashion',
      level: 0,
      icon: '👗',
      sortOrder: 2,
      parentId: null,
    },
    create: {
      name: 'Fashion',
      slug: 'fashion',
      level: 0,
      icon: '👗',
      sortOrder: 2,
      parentId: null,
    },
  });

  const men = await db.category.upsert({
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

  await db.category.upsert({
    where: { slug: 'fashion-men-tshirts' },
    update: {
      name: 'T-Shirts',
      aliases: ['tshirts', 't-shirt', 'tee'],
      parentId: men.id,
      level: 2,
      sortOrder: 1,
    },
    create: {
      name: 'T-Shirts',
      slug: 'fashion-men-tshirts',
      aliases: ['tshirts', 't-shirt', 'tee'],
      parentId: men.id,
      level: 2,
      sortOrder: 1,
    },
  });
}
