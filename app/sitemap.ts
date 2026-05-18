import type { MetadataRoute } from 'next';
import { isDatabaseConfigured, prisma } from '@/lib/db';
import { absoluteUrl } from '@/lib/seo';
import { DEFAULT_CATEGORY_TREE, DefaultCategoryNode } from '@/lib/default-categories';

/** Flatten a category tree into category route data. */
function flattenCategoryEntries(nodes: DefaultCategoryNode[]): Array<{ id: string; slug: string }> {
  const entries: Array<{ id: string; slug: string }> = [];
  for (const node of nodes) {
    entries.push({ id: node.id, slug: node.slug });
    if (node.children.length > 0) {
      entries.push(...flattenCategoryEntries(node.children));
    }
  }
  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // ── Static routes ──────────────────────────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: absoluteUrl('/garage-sales'), lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: absoluteUrl('/signup'), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: absoluteUrl('/login'), lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: absoluteUrl('/legal/terms'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/legal/privacy'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/legal/seller-agreement'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/legal/refund'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];

  // ── Category pages (SEO-friendly paths) ────────────────────────────────────
  // Query-param category variants (/?category=...) are intentionally excluded
  // to avoid duplicate/competing URL patterns in search indexing.
  const categoryEntries = flattenCategoryEntries(DEFAULT_CATEGORY_TREE);
  const categoryRoutes: MetadataRoute.Sitemap = categoryEntries.map((entry) => ({
    url: absoluteUrl(`/category/${entry.slug}`),
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }));

  if (!isDatabaseConfigured()) {
    return [...staticRoutes, ...categoryRoutes];
  }

  // ── Dynamic product, seller, and garage-sale pages ─────────────────────────
  let productRoutes: MetadataRoute.Sitemap = [];
  let sellerRoutes: MetadataRoute.Sitemap = [];
  let garageSaleRoutes: MetadataRoute.Sitemap = [];

  try {
    const [products, sellers, garageSales] = await Promise.all([
      prisma.product.findMany({
        where: { status: { in: ['APPROVED', 'ACTIVE'] } },
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
          products: { some: { status: { in: ['APPROVED', 'ACTIVE'] } } },
        },
        select: { id: true },
      }),
      prisma.garageSale.findMany({
        where: {
          status: 'APPROVED',
          paymentStatus: 'PAID',
          isSpam: false,
          isArchived: false,
          endDate: { gte: now },
        },
        select: { id: true, updatedAt: true },
        take: 50_000,
        orderBy: { updatedAt: 'desc' },
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

    garageSaleRoutes = garageSales.map((sale) => ({
      url: absoluteUrl(`/garage-sales/${sale.id}`),
      lastModified: sale.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));
  } catch {
    // Database unavailable at sitemap generation time — skip dynamic routes.
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...sellerRoutes, ...garageSaleRoutes];
}
