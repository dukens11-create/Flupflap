import { NextResponse } from 'next/server';
import { DEFAULT_CATEGORY_TREE, type DefaultCategoryNode } from '@/lib/default-categories';
import { normalizePerfumeAttributeSchema } from '@/lib/category-attribute-schema';
import { isDatabaseConfigured, prisma } from '@/lib/db';
import { ensureFashionCategoryHierarchy } from '@/lib/ensure-fashion-category-hierarchy';

export const dynamic = 'force-dynamic';

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  parentId: string | null;
  level: number;
  icon: string | null;
  sortOrder: number;
  attributeSchema: unknown;
  productCount: number;
  children: CategoryNode[];
}

type CategoryRecord = Omit<CategoryNode, 'children' | 'productCount'>;

function buildTree(categories: CategoryRecord[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  for (const cat of categories) {
    map.set(cat.id, { ...cat, productCount: 0, children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const node of map.values()) {
    if (node.parentId) {
      const parent = map.get(node.parentId);
      if (parent) parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Sort by sortOrder at each level
  const sort = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const n of nodes) sort(n.children);
  };
  sort(roots);
  return roots;
}

function withZeroCounts(nodes: DefaultCategoryNode[]): CategoryNode[] {
  return nodes.map((node) => ({
    ...node,
    attributeSchema: normalizePerfumeAttributeSchema(node.attributeSchema),
    productCount: 0,
    children: withZeroCounts(node.children),
  }));
}

function applyProductCounts(nodes: CategoryNode[], directCounts: Map<string, number>): CategoryNode[] {
  return nodes.map((node) => {
    const children = applyProductCounts(node.children, directCounts);
    const childCount = children.reduce((sum, child) => sum + child.productCount, 0);
    return {
      ...node,
      children,
      productCount: (directCounts.get(node.id) ?? 0) + childCount,
    };
  });
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(withZeroCounts(DEFAULT_CATEGORY_TREE));
  }

  try {
    await ensureFashionCategoryHierarchy(prisma);
    const [cats, products] = await Promise.all([
      prisma.category.findMany({
        orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, name: true, slug: true, aliases: true, parentId: true, level: true, icon: true, sortOrder: true, attributeSchema: true },
      }),
      prisma.product.findMany({
        where: { status: { in: ['APPROVED', 'ACTIVE'] }, inventory: { gt: 0 } },
        select: { categoryId: true, subcategoryId: true },
      }),
    ]);
    if (cats.length === 0) {
      return NextResponse.json(withZeroCounts(DEFAULT_CATEGORY_TREE));
    }
    const mergedCategories = cats.map((category) => ({
      ...category,
      attributeSchema: normalizePerfumeAttributeSchema(category.attributeSchema),
    }));
    const directCounts = new Map<string, number>();
    for (const product of products) {
      const assignedCategoryId = product.subcategoryId ?? product.categoryId;
      if (!assignedCategoryId) continue;
      directCounts.set(assignedCategoryId, (directCounts.get(assignedCategoryId) ?? 0) + 1);
    }
    const tree = applyProductCounts(buildTree(mergedCategories), directCounts);
    return NextResponse.json(tree);
  } catch {
    return NextResponse.json(withZeroCounts(DEFAULT_CATEGORY_TREE));
  }
}
