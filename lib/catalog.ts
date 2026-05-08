import { unstable_cache } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { PRODUCTS_CACHE_TAG, productCacheTag } from '@/lib/cache-tags';

export interface CatalogSearchParams {
  q?: string;
  category?: string;
  condition?: string;
  minPrice?: string;
  maxPrice?: string;
}

const CATALOG_CACHE_TTL_SECONDS = Number(process.env.CATALOG_CACHE_TTL_SECONDS ?? 60);

function buildApprovedProductWhere(sp: CatalogSearchParams): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { status: 'APPROVED' };

  if (sp.q) where.title = { contains: sp.q, mode: 'insensitive' };
  if (sp.category) where.category = sp.category;
  if (sp.condition) where.condition = sp.condition;
  if (sp.minPrice || sp.maxPrice) {
    where.priceCents = {};
    if (sp.minPrice) where.priceCents.gte = Math.round(Number(sp.minPrice) * 100);
    if (sp.maxPrice) where.priceCents.lte = Math.round(Number(sp.maxPrice) * 100);
  }

  return where;
}

export async function getCachedCatalogProducts(sp: CatalogSearchParams) {
  const where = buildApprovedProductWhere(sp);

  const loadProducts = unstable_cache(
    async (inputWhere: Prisma.ProductWhereInput) =>
      prisma.product.findMany({
        where: inputWhere,
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: {
          promotions: {
            where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
            orderBy: { expiresAt: 'desc' },
            take: 1,
          },
        },
      }),
    ['catalog-products'],
    { revalidate: CATALOG_CACHE_TTL_SECONDS, tags: [PRODUCTS_CACHE_TAG] },
  );

  return loadProducts(where);
}

export async function getCachedApprovedProduct(productId: string) {
  const loadProduct = unstable_cache(
    async (id: string) =>
      prisma.product.findUnique({
        where: { id },
        include: {
          seller: { select: { id: true, name: true } },
          promotions: {
            where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
            orderBy: { expiresAt: 'desc' },
            take: 1,
          },
        },
      }),
    [productCacheTag(productId)],
    {
      revalidate: CATALOG_CACHE_TTL_SECONDS,
      tags: [PRODUCTS_CACHE_TAG, productCacheTag(productId)],
    },
  );

  return loadProduct(productId);
}
