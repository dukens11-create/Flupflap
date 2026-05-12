import { NextResponse } from 'next/server';
import { DEFAULT_CATEGORY_TREE } from '@/lib/default-categories';
import { normalizePerfumeAttributeSchema } from '@/lib/category-attribute-schema';
import { isDatabaseConfigured, prisma } from '@/lib/db';

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
  children: CategoryNode[];
}

function flattenDefaults(nodes: CategoryNode[]): Omit<CategoryNode, 'children'>[] {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      name: node.name,
      slug: node.slug,
      aliases: node.aliases,
      parentId: node.parentId,
      level: node.level,
      icon: node.icon,
      sortOrder: node.sortOrder,
      attributeSchema: node.attributeSchema,
    },
    ...flattenDefaults(node.children),
  ]);
}

function buildTree(categories: Omit<CategoryNode, 'children'>[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
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

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(DEFAULT_CATEGORY_TREE);
  }

  try {
    const cats = await prisma.category.findMany({
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, name: true, slug: true, aliases: true, parentId: true, level: true, icon: true, sortOrder: true, attributeSchema: true },
    });
    if (cats.length === 0) {
      return NextResponse.json(DEFAULT_CATEGORY_TREE);
    }
    const mergedCategories = [
      ...cats.map((category) => ({
        ...category,
        attributeSchema: normalizePerfumeAttributeSchema(category.attributeSchema),
      })),
    ];
    const existingIds = new Set(mergedCategories.map((category) => category.id));
    const defaultFallbacks = flattenDefaults(DEFAULT_CATEGORY_TREE)
      .filter((category) => !existingIds.has(category.id))
      .map((category) => ({
        ...category,
        attributeSchema: normalizePerfumeAttributeSchema(category.attributeSchema),
      }));
    const tree = buildTree([...mergedCategories, ...defaultFallbacks]);
    return NextResponse.json(tree);
  } catch {
    return NextResponse.json(DEFAULT_CATEGORY_TREE);
  }
}
