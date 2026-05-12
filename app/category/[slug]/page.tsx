import { notFound, redirect } from 'next/navigation';
import { isDatabaseConfigured, prisma } from '@/lib/db';
import { createPageMetadata } from '@/lib/seo';
import { DEFAULT_CATEGORY_TREE, type DefaultCategoryNode } from '@/lib/default-categories';

export const dynamic = 'force-dynamic';

type CategoryLookup = {
  id: string;
  name: string;
  slug: string;
  level: number;
  path: Array<{ id: string; level: number }>;
};

function flattenCategories(
  nodes: DefaultCategoryNode[],
  parentPath: Array<{ id: string; level: number }> = [],
): CategoryLookup[] {
  return nodes.flatMap((node) => {
    const path = [...parentPath, { id: node.id, level: node.level }];
    return [
      { id: node.id, name: node.name, slug: node.slug, level: node.level, path },
      ...flattenCategories(node.children, path),
    ];
  });
}

function buildPathForCategory(
  category: { id: string; level: number; parentId: string | null },
  lookup: Map<string, { id: string; level: number; parentId: string | null }>,
) {
  const path: Array<{ id: string; level: number }> = [];
  const seen = new Set<string>();
  let current: { id: string; level: number; parentId: string | null } | undefined = category;

  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    path.push({ id: current.id, level: current.level });
    current = current.parentId ? lookup.get(current.parentId) : undefined;
  }

  return path.reverse();
}

async function findCategoryBySlug(slug: string): Promise<CategoryLookup | null> {
  if (isDatabaseConfigured()) {
    try {
      const categories = await prisma.category.findMany({
        select: { id: true, name: true, slug: true, level: true, parentId: true },
      });
      const category = categories.find((entry) => entry.slug === slug) ?? null;
      if (category) {
        const lookup = new Map(categories.map((entry) => [entry.id, entry]));
        return {
          id: category.id,
          name: category.name,
          slug: category.slug,
          level: category.level,
          path: buildPathForCategory(category, lookup),
        };
      }
    } catch {
      // fall through to default categories
    }
  }

  return flattenCategories(DEFAULT_CATEGORY_TREE).find((category) => category.slug === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await findCategoryBySlug(slug);

  if (!category) {
    return createPageMetadata({
      title: 'Category not found',
      description: 'The requested category could not be found.',
      noIndex: true,
    });
  }

  return createPageMetadata({
    title: `${category.name} | FlupFlap`,
    description: `Browse ${category.name} from trusted sellers on FlupFlap.`,
    path: `/category/${category.slug}`,
  });
}

export default async function CategoryRoutePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await findCategoryBySlug(slug);

  if (!category) notFound();

  const rootId = category.path.find((entry) => entry.level === 0)?.id ?? category.id;
  const levelOneId = category.path.find((entry) => entry.level === 1)?.id ?? null;
  const paramsOut = new URLSearchParams();
  paramsOut.set('category', rootId);
  if (category.level === 1) {
    paramsOut.set('subcategory', category.id);
  } else if (category.level >= 2 && levelOneId) {
    paramsOut.set('subcategory', levelOneId);
    paramsOut.set('refineCategory', category.id);
  }

  redirect(`/?${paramsOut.toString()}`);
}
