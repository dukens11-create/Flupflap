import type { MetadataRoute } from 'next';
import { isDatabaseConfigured, prisma } from '@/lib/db';
import { absoluteUrl } from '@/lib/seo';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/login'), changeFrequency: 'monthly', priority: 0.3 },
    { url: absoluteUrl('/signup'), changeFrequency: 'monthly', priority: 0.6 },
    { url: absoluteUrl('/legal/terms'), changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/legal/privacy'), changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/legal/seller-agreement'), changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/legal/refund'), changeFrequency: 'yearly', priority: 0.2 },
  ];

  if (!isDatabaseConfigured()) {
    return staticRoutes;
  }

  let approvedProducts: Array<{ id: string; updatedAt: Date }> = [];
  try {
    approvedProducts = await prisma.product.findMany({
      where: { status: 'APPROVED' },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  } catch {
    return staticRoutes;
  }

  const productRoutes: MetadataRoute.Sitemap = approvedProducts.map((product) => ({
    url: absoluteUrl(`/products/${product.id}`),
    lastModified: product.updatedAt,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  return [...staticRoutes, ...productRoutes];
}
