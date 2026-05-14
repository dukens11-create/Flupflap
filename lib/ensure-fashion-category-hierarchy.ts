import type { PrismaClient } from '@prisma/client';

type CategoryWriter = Pick<PrismaClient, 'category'>;
let ensurePromise: Promise<void> | null = null;

/**
 * Ensures the Fashion > Men > T-Shirts branch exists for environments that
 * have not run the latest seed script yet. Safe to call repeatedly.
 */
export async function ensureFashionCategoryHierarchy(db: CategoryWriter) {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const fashion = await db.category.upsert({
        where: { slug: 'fashion' },
        update: {},
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
        update: {},
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
        update: {},
        create: {
          name: 'T-Shirts',
          slug: 'fashion-men-tshirts',
          aliases: ['tshirts', 't-shirt', 'tee'],
          parentId: men.id,
          level: 2,
          sortOrder: 1,
        },
      });
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  await ensurePromise;
}
