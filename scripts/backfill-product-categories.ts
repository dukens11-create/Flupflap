import { isDatabaseConfigured, prisma } from '../lib/db';
import {
  resolveLegacyCategorySelection,
  type CategoryHierarchyNode,
} from '../lib/category-hierarchy';

async function run() {
  const confirm = process.argv.includes('--confirm');

  if (!isDatabaseConfigured()) {
    console.log('[backfill-product-categories] DATABASE_URL is not configured. Set it before running this repair.');
    return;
  }

  const categories = await prisma.category.findMany({
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
    select: { id: true, name: true, slug: true, aliases: true, parentId: true, level: true },
  }) as CategoryHierarchyNode[];
  const products = await prisma.product.findMany({
    select: {
      id: true,
      title: true,
      category: true,
      categoryId: true,
      subcategoryId: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const repairs = products.flatMap((product) => {
    const resolved = resolveLegacyCategorySelection(categories, {
      categoryId: product.categoryId,
      subcategoryId: product.subcategoryId,
      categoryLabel: product.category,
    });
    if (resolved.stale) {
      return [];
    }

    const changed =
      resolved.categoryId !== product.categoryId
      || resolved.subcategoryId !== product.subcategoryId
      || (resolved.displayName && resolved.displayName !== product.category);
    if (!changed) {
      return [];
    }

    return [{
      productId: product.id,
      title: product.title,
      current: {
        category: product.category,
        categoryId: product.categoryId,
        subcategoryId: product.subcategoryId,
      },
      next: {
        category: resolved.displayName,
        categoryId: resolved.categoryId,
        subcategoryId: resolved.subcategoryId,
        path: resolved.path.map((node) => node.name).join(' > '),
      },
      reason: resolved.reason ?? 'Normalized stored category IDs to the current hierarchy.',
    }];
  });

  console.log(`[backfill-product-categories] Found ${repairs.length} product(s) that can be repaired.`);
  if (repairs.length > 0) {
    console.table(repairs.map((repair) => ({
      productId: repair.productId,
      title: repair.title.slice(0, 40),
      currentCategoryId: repair.current.categoryId ?? '',
      currentSubcategoryId: repair.current.subcategoryId ?? '',
      nextCategoryId: repair.next.categoryId ?? '',
      nextSubcategoryId: repair.next.subcategoryId ?? '',
      nextCategory: repair.next.category ?? '',
      path: repair.next.path,
      reason: repair.reason,
    })));
  }

  if (!confirm || repairs.length === 0) {
    console.log('[backfill-product-categories] Dry run only. Re-run with --confirm to apply repairs.');
    return;
  }

  for (const repair of repairs) {
    await prisma.product.update({
      where: { id: repair.productId },
      data: {
        category: repair.next.category ?? repair.current.category,
        categoryId: repair.next.categoryId,
        subcategoryId: repair.next.subcategoryId,
      },
    });
  }

  console.log(`[backfill-product-categories] Applied ${repairs.length} repair(s).`);
}

run()
  .catch((error) => {
    console.error('[backfill-product-categories] Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
