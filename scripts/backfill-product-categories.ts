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

  const analyzed = products.map((product) => {
    const resolved = resolveLegacyCategorySelection(categories, {
      categoryId: product.categoryId,
      subcategoryId: product.subcategoryId,
      categoryLabel: product.category,
    });
    return { product, resolved };
  });

  const repairs = analyzed.flatMap(({ product, resolved }) => {
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
  const skipped = analyzed.flatMap(({ product, resolved }) => {
    if (!resolved.stale) {
      return [];
    }

    // Skip rows we cannot confidently map back onto the current hierarchy.
    // These need manual review because neither the stored IDs nor the saved label
    // provide an unambiguous repair target.
    return [{
      productId: product.id,
      title: product.title,
      category: product.category,
      categoryId: product.categoryId ?? '',
      subcategoryId: product.subcategoryId ?? '',
      reason: resolved.reason ?? 'Manual review required.',
    }];
  });

  console.log(`[backfill-product-categories] Found ${repairs.length} product(s) that can be repaired.`);
  if (repairs.length > 0) {
    console.table(repairs.map((repair) => ({
      productId: repair.productId,
      title: repair.title.slice(0, 40),
      currentCategoryId: repair.current.categoryId ?? '(none)',
      currentSubcategoryId: repair.current.subcategoryId ?? '(none)',
      nextCategoryId: repair.next.categoryId ?? '(none)',
      nextSubcategoryId: repair.next.subcategoryId ?? '(none)',
      nextCategory: repair.next.category ?? '(none)',
      path: repair.next.path,
      reason: repair.reason,
    })));
  }
  if (skipped.length > 0) {
    console.log(`[backfill-product-categories] Skipped ${skipped.length} product(s) that need manual review.`);
    console.table(skipped.map((item) => ({
      productId: item.productId,
      title: item.title.slice(0, 40),
      category: item.category || '(none)',
      categoryId: item.categoryId || '(none)',
      subcategoryId: item.subcategoryId || '(none)',
      reason: item.reason,
    })));
  }

  if (!confirm || repairs.length === 0) {
    console.log('[backfill-product-categories] Dry run only. Re-run with --confirm to apply repairs.');
    return;
  }

  await prisma.$transaction(
    repairs.map((repair) => prisma.product.update({
      where: { id: repair.productId },
      data: {
        category: repair.next.category ?? repair.current.category,
        categoryId: repair.next.categoryId,
        subcategoryId: repair.next.subcategoryId,
      },
    })),
  );

  console.log(`[backfill-product-categories] Applied ${repairs.length} repair(s).`);
}

run()
  .catch((error) => {
    console.error('[backfill-product-categories] Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    if (isDatabaseConfigured()) {
      await prisma.$disconnect();
    }
  });
