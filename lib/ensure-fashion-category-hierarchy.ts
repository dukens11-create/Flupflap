import type { PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORY_TREE, type DefaultCategoryNode } from '@/lib/default-categories';

type CategoryWriter = Pick<PrismaClient, 'category'>;
let ensurePromise: Promise<void> | null = null;

/**
 * Ensures the default marketplace hierarchy exists for environments that
 * have not run the latest seed script yet. Safe to call repeatedly.
 */
export async function ensureFashionCategoryHierarchy(db: CategoryWriter) {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      async function upsertNode(entry: DefaultCategoryNode, parentId: string | null) {
        const record = await db.category.upsert({
          where: { slug: entry.slug },
          update: {
            name: entry.name,
            aliases: entry.aliases,
            parentId,
            level: entry.level,
            icon: entry.icon,
            sortOrder: entry.sortOrder,
            attributeSchema: entry.attributeSchema as any,
          },
          create: {
            name: entry.name,
            slug: entry.slug,
            aliases: entry.aliases,
            parentId,
            level: entry.level,
            icon: entry.icon,
            sortOrder: entry.sortOrder,
            attributeSchema: entry.attributeSchema as any,
          },
        });

        for (const child of entry.children) {
          await upsertNode(child, record.id);
        }
      }

      for (const root of DEFAULT_CATEGORY_TREE) {
        await upsertNode(root, null);
      }
    })();
  }

  try {
    await ensurePromise;
  } catch (error) {
    ensurePromise = null;
    throw error;
  }
}
