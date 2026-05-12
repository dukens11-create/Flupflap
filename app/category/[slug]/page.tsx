import { notFound, redirect } from 'next/navigation';
import { DEFAULT_CATEGORY_TREE, type DefaultCategoryNode } from '@/lib/default-categories';
import { isDatabaseConfigured, prisma } from '@/lib/db';

function findDefaultCategoryBySlug(nodes: DefaultCategoryNode[], slug: string): DefaultCategoryNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const nested = findDefaultCategoryBySlug(node.children, slug);
    if (nested) return nested;
  }
  return null;
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!isDatabaseConfigured()) {
    const defaultCategory = findDefaultCategoryBySlug(DEFAULT_CATEGORY_TREE, slug);
    if (!defaultCategory) notFound();
    redirect(`/?category=${defaultCategory.id}`);
  }

  const category = await prisma.category.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (category) {
    redirect(`/?category=${category.id}`);
  }

  const defaultCategory = findDefaultCategoryBySlug(DEFAULT_CATEGORY_TREE, slug);
  if (!defaultCategory) notFound();
  redirect(`/?category=${defaultCategory.id}`);
}
