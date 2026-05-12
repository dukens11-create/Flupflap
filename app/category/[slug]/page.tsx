import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import HomePage from '@/app/page';
import { CULTURAL_MARKETPLACES } from '@/lib/cultural-marketplaces';
import { isDatabaseConfigured, prisma } from '@/lib/db';
import { DEFAULT_CATEGORY_TREE } from '@/lib/default-categories';

type CategoryRouteParams = Promise<{ slug: string }>;
type CategoryRouteSearchParams = Promise<Record<string, string | string[] | undefined>>;

function findCategoryIdBySlugFromDefaults(slug: string): string | null {
  const stack = [...DEFAULT_CATEGORY_TREE];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.slug === slug) return current.id;
    stack.push(...current.children);
  }
  return null;
}

async function resolveCategoryId(slug: string): Promise<string | null> {
  if (!isDatabaseConfigured()) {
    return findCategoryIdBySlugFromDefaults(slug);
  }

  try {
    const category = await prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (category?.id) return category.id;
  } catch {
    // fall back to defaults
  }

  return findCategoryIdBySlugFromDefaults(slug);
}

export async function generateMetadata({ params }: { params: CategoryRouteParams }): Promise<Metadata> {
  const { slug } = await params;
  const marketplace = CULTURAL_MARKETPLACES.find((entry) => entry.slug === slug);
  const title = marketplace?.name ?? 'Category';
  return {
    title: `${title} | Browse Products`,
    description: marketplace?.featuredSubtitle ?? `Browse products in ${title}.`,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: CategoryRouteParams;
  searchParams: CategoryRouteSearchParams;
}) {
  const { slug } = await params;
  const categoryId = await resolveCategoryId(slug);

  if (!categoryId) notFound();

  const incomingSearchParams = await searchParams;
  const normalizedSearchParams: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(incomingSearchParams)) {
    normalizedSearchParams[key] = Array.isArray(value) ? value[0] : value;
  }

  return HomePage({
    searchParams: Promise.resolve({
      ...normalizedSearchParams,
      category: categoryId,
    }),
  });
}
