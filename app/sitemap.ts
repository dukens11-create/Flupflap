import { MetadataRoute } from 'next';
import { prisma, isDatabaseConfigured } from '@/lib/db';
import { DEFAULT_CATEGORY_TREE, DefaultCategoryNode } from '@/lib/default-categories';

const BASE_URL = 'https://www.flupflap.com';

/** Flatten a category tree into a list of category ids. */
function flattenCategoryIds(nodes: DefaultCategoryNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (node.children.length > 0) {
      ids.push(...flattenCategoryIds(node.children));
    }
  }
  return ids;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // ── Static routes ──────────────────────────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];

  // ── Category pages (homepage query-param URLs) ─────────────────────────────
  const categoryIds = flattenCategoryIds(DEFAULT_CATEGORY_TREE);
  const categoryRoutes: MetadataRoute.Sitemap = categoryIds.map((id) => ({
    url: `${BASE_URL}/?category=${id}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  if (!isDatabaseConfigured()) {
    return [...staticRoutes, ...categoryRoutes];
  }

  // ── Dynamic product pages ──────────────────────────────────────────────────
  let productRoutes: MetadataRoute.Sitemap = [];
  let sellerRoutes: MetadataRoute.Sitemap = [];

  try {
    const [products, sellers] = await Promise.all([
      prisma.product.findMany({
        where: { status: 'APPROVED' },
        select: { id: true, updatedAt: true },
      }),
      prisma.user.findMany({
        where: {
          role: 'SELLER',
          sellerStatus: 'ACTIVE',
          deletedAt: null,
          products: { some: { status: 'APPROVED' } },
        },
        select: { id: true },
      }),
    ]);

    productRoutes = products.map((p) => ({
      url: `${BASE_URL}/products/${p.id}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }));

    sellerRoutes = sellers.map((s) => ({
      url: `${BASE_URL}/store/${s.id}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch {
    // Database unavailable at sitemap generation time — skip dynamic routes.
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...sellerRoutes];
}
