import type { MetadataRoute } from 'next';
import { isDatabaseConfigured, prisma } from '@/lib/db';
import { absoluteUrl } from '@/lib/seo';
import { DEFAULT_CATEGORY_TREE, DefaultCategoryNode } from '@/lib/default-categories';

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
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: absoluteUrl('/signup'), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: absoluteUrl('/login'), lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: absoluteUrl('/legal/terms'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/legal/privacy'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/legal/seller-agreement'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/legal/refund'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];

  // ── Category pages (homepage query-param URLs) ─────────────────────────────
  const categoryIds = flattenCategoryIds(DEFAULT_CATEGORY_TREE);
  const categoryRoutes: MetadataRoute.Sitemap = categoryIds.map((id) => ({
    url: absoluteUrl(`/?category=${id}`),
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  if (!isDatabaseConfigured()) {
    return [...staticRoutes, ...categoryRoutes];
  }

  // ── Dynamic product and seller pages ──────────────────────────────────────
  let productRoutes: MetadataRoute.Sitemap = [];
  let sellerRoutes: MetadataRoute.Sitemap = [];

  try {
    const [products, sellers] = await Promise.all([
      prisma.product.findMany({
        where: { status: 'APPROVED' },
        select: { id: true, updatedAt: true },
        // Limit to a manageable page size; for very large catalogues a
        // sitemap-index with multiple sitemap files should be used instead.
        take: 50_000,
        orderBy: { updatedAt: 'desc' },
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
      url: absoluteUrl(`/products/${p.id}`),
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }));

    sellerRoutes = sellers.map((s) => ({
      url: absoluteUrl(`/store/${s.id}`),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch {
    // Database unavailable at sitemap generation time — skip dynamic routes.
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...sellerRoutes];
}
