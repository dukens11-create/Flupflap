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
    const tree = buildTree(
      cats.map((category) => ({
        ...category,
        attributeSchema: normalizePerfumeAttributeSchema(category.attributeSchema),
      })),
    );
    return NextResponse.json(tree);
  } catch {
    return NextResponse.json(DEFAULT_CATEGORY_TREE);
  }
}
