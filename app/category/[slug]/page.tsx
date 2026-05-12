import { notFound, redirect } from 'next/navigation';
import { isDatabaseConfigured, prisma } from '@/lib/db';
import { createPageMetadata } from '@/lib/seo';
import { DEFAULT_CATEGORY_TREE, type DefaultCategoryNode } from '@/lib/default-categories';

export const dynamic = 'force-dynamic';

type CategoryLookup = {
  id: string;
  name: string;
  slug: string;
};

function flattenCategories(nodes: DefaultCategoryNode[]): CategoryLookup[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, slug: node.slug },
    ...flattenCategories(node.children),
  ]);
}

async function findCategoryBySlug(slug: string): Promise<CategoryLookup | null> {
  if (isDatabaseConfigured()) {
    try {
      const category = await prisma.category.findUnique({
        where: { slug },
        select: { id: true, name: true, slug: true },
      });
      if (category) return category;
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

  redirect(`/?category=${encodeURIComponent(category.id)}`);
}
