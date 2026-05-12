import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { prisma, isDatabaseConfigured } from '@/lib/db';
import ProductCard from '@/components/ProductCard';
import BrowseFilters from '@/components/BrowseFilters';
import type { Metadata } from 'next';
import { expirePromotions } from '@/lib/promotions';
import { getServerTranslations } from '@/lib/i18n/server';
import { ArrowRight } from 'lucide-react';
import { getSellerResponseStatsForSellers } from '@/lib/messages';
import { authOptions } from '@/lib/auth-options';
import { getRoleDefaultPath, normalizeExperienceRole } from '@/lib/role-experience';
import { CULTURAL_MARKETPLACES } from '@/lib/cultural-marketplaces';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Browse Products' };

/**
 * Returns true when a Prisma/Postgres error indicates the schema has not been
 * applied yet (tables or columns are missing). This lets the homepage show a
 * clear, actionable message instead of crashing to the global error boundary.
 *
 * Common causes: first deploy before Prisma migrations have been applied, or
 * DATABASE_URL points to a brand-new empty database.
 */
function isSchemaNotInitializedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  // Prisma error codes: P2021 = table does not exist, P2022 = column does not exist
  const code = (err as { code?: string }).code;
  if (code === 'P2021' || code === 'P2022') return true;
  // Fallback: check the raw message for postgres "relation does not exist" text
  const msg = String((err as { message?: string }).message ?? '');
  return /relation .+ does not exist/i.test(msg) || /table .+ does not exist/i.test(msg);
}

interface SearchParams {
  q?: string;
  category?: string;
  subcategory?: string;
  refineCategory?: string;
  condition?: string;
  minPrice?: string;
  maxPrice?: string;
  brand?: string;
  size?: string;
  color?: string;
  gender?: string;
  shipping?: string;
  pickup?: string;
}

function getUniqueSellerIds(products: Array<{ sellerId: string }>) {
  return Array.from(new Set(products.map((product) => product.sellerId)));
}

function collectStringValues(value: unknown, strings: string[]) {
  if (typeof value === 'string') {
    strings.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, strings);
    return;
  }
  if (value && typeof value === 'object') {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      collectStringValues(nestedValue, strings);
    }
  }
}

type SearchableProduct = {
  title: string;
  description: string;
  category: string;
  productAttributes: unknown;
  categoryRef?: {
    name?: string | null;
    aliases?: string[] | null;
  } | null;
  subcategoryRef?: {
    name?: string | null;
    aliases?: string[] | null;
    parent?: {
      name?: string | null;
      aliases?: string[] | null;
      parent?: {
        name?: string | null;
        aliases?: string[] | null;
      } | null;
    } | null;
  } | null;
};

function productMatchesSearch(product: SearchableProduct, query?: string) {
  const normalizedQuery = query?.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  const searchableValues: string[] = [
    product.title,
    product.description,
    product.category,
    product.categoryRef?.name,
    ...(product.categoryRef?.aliases ?? []),
    product.subcategoryRef?.name,
    ...(product.subcategoryRef?.aliases ?? []),
    product.subcategoryRef?.parent?.name,
    ...(product.subcategoryRef?.parent?.aliases ?? []),
    product.subcategoryRef?.parent?.parent?.name,
    ...(product.subcategoryRef?.parent?.parent?.aliases ?? []),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  collectStringValues(product.productAttributes, searchableValues);

  return searchableValues.some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
}

async function CulturalMarketplaceHighlights() {
  if (!isDatabaseConfigured()) return null;

  try {
    const categories = await prisma.category.findMany({
      where: { slug: { in: CULTURAL_MARKETPLACES.map((marketplace) => marketplace.slug) } },
      select: { id: true, slug: true },
    });

    if (categories.length === 0) return null;

    const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));
    const sections = await Promise.all(
      CULTURAL_MARKETPLACES.map(async (marketplace) => {
        const categoryId = categoryBySlug.get(marketplace.slug);
        if (!categoryId) return null;

        const products = await prisma.product.findMany({
          where: {
            status: 'APPROVED',
            inventory: { gt: 0 },
            categoryId,
          },
          orderBy: { createdAt: 'desc' },
          take: 4,
          include: {
            seller: {
              select: {
                id: true,
                name: true,
                shopName: true,
                phoneVerified: true,
                verificationSubmission: {
                  select: {
                    status: true,
                    eligibleToListAt: true,
                    adminFallbackStatus: true,
                  },
                },
              },
            },
            promotions: {
              where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
              orderBy: { expiresAt: 'desc' },
              take: 1,
            },
            cartInterest: {
              select: { totalAdds: true },
            },
          },
        });

        if (products.length === 0) return null;

        const sellerResponseRates = await getSellerResponseStatsForSellers(getUniqueSellerIds(products));

        return {
          marketplace,
          products: products.map((product) => ({
            ...product,
            activePromotion: product.promotions[0] ?? null,
            sellerResponseRate: sellerResponseRates.get(product.sellerId)?.responseRate ?? null,
          })),
        };
      }),
    );

    const visibleSections = sections.filter((section): section is NonNullable<typeof section> => Boolean(section));

    if (visibleSections.length === 0) return null;

    return (
      <section className="space-y-5">
        {visibleSections.map((section) => (
          <div
            key={section.marketplace.slug}
            className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
                  {section.marketplace.name}
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                  {section.marketplace.featuredTitle}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  {section.marketplace.featuredSubtitle}
                </p>
              </div>
              <Link href={`/category/${section.marketplace.slug}`} className="btn-brand-outline">
                Explore {section.marketplace.name}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {section.products.map((product) => (
                <ProductCard key={product.id} p={product} />
              ))}
            </div>
          </div>
        ))}
      </section>
    );
  } catch (err) {
    console.error('[HomePage] failed to load cultural marketplace highlights', err);
    return null;
  }
}

async function ProductGrid({ sp, t }: { sp: SearchParams; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const where: any = { status: 'APPROVED', inventory: { gt: 0 } };

  // Category filtering: prefer structured category IDs and keep legacy string fallback
  // so older listings (without categoryId/subcategoryId) are still discoverable.
  if (sp.category) {
    where.AND = where.AND ?? [];
    const categoryOrConditions: any[] = [{ categoryId: sp.category }];
    try {
      const categoryRecord = await prisma.category.findUnique({
        where: { id: sp.category },
        select: { name: true, aliases: true },
      });
      const fallbackTerms = [categoryRecord?.name, ...(categoryRecord?.aliases ?? [])]
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
      for (const term of fallbackTerms) {
        categoryOrConditions.push({ category: { contains: term, mode: 'insensitive' } });
      }
    } catch (err) {
      console.error('[ProductGrid] category lookup failed:', err);
    }
    where.AND.push({ OR: categoryOrConditions });
  }
  if (sp.refineCategory) {
    where.AND = where.AND ?? [];
    const refineCategoryOrConditions: any[] = [{ subcategoryId: sp.refineCategory }];
    try {
      const refineCategoryRecord = await prisma.category.findUnique({
        where: { id: sp.refineCategory },
        select: { name: true, aliases: true },
      });
      const fallbackTerms = [refineCategoryRecord?.name, ...(refineCategoryRecord?.aliases ?? [])]
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
      for (const term of fallbackTerms) {
        refineCategoryOrConditions.push({ category: { contains: term, mode: 'insensitive' } });
      }
    } catch (err) {
      console.error('[ProductGrid] refine category lookup failed:', err);
    }
    where.AND.push({ OR: refineCategoryOrConditions });
  } else if (sp.subcategory) {
    where.AND = where.AND ?? [];
    const subcategoryOrConditions: any[] = [
      { subcategoryId: sp.subcategory },
      { subcategoryRef: { is: { parentId: sp.subcategory } } },
    ];
    try {
      const subcategoryRecord = await prisma.category.findUnique({
        where: { id: sp.subcategory },
        select: {
          name: true,
          aliases: true,
          children: { select: { name: true, aliases: true } },
        },
      });
      const fallbackTerms = [
        subcategoryRecord?.name,
        ...(subcategoryRecord?.aliases ?? []),
        ...(subcategoryRecord?.children.map((child) => child.name) ?? []),
        ...(subcategoryRecord?.children.flatMap((child) => child.aliases ?? []) ?? []),
      ].filter((value): value is string => typeof value === 'string' && value.length > 0);
      for (const term of fallbackTerms) {
        subcategoryOrConditions.push({ category: { contains: term, mode: 'insensitive' } });
      }
    } catch (err) {
      console.error('[ProductGrid] subcategory lookup failed:', err);
    }
    where.AND.push({ OR: subcategoryOrConditions });
  }

  if (sp.condition) where.condition = sp.condition;
  if (sp.minPrice || sp.maxPrice) {
    where.priceCents = {};
    if (sp.minPrice) where.priceCents.gte = Math.round(Number(sp.minPrice) * 100);
    if (sp.maxPrice) where.priceCents.lte = Math.round(Number(sp.maxPrice) * 100);
  }
  if (sp.shipping === 'free') where.shippingCents = 0;
  if (sp.pickup === '1') where.pickupAvailable = true;

  // Attribute filters (brand, size, color, gender) — JSON path query on productAttributes
  const attrFilters: Record<string, string> = {};
  if (sp.brand) attrFilters.brand = sp.brand;
  if (sp.size) attrFilters.size = sp.size;
  if (sp.color) attrFilters.color = sp.color;
  if (sp.gender) attrFilters.gender = sp.gender;

  // If attribute filters present, apply JSON path conditions
  // (Prisma supports `path` filter on Json columns for PostgreSQL)
  if (Object.keys(attrFilters).length > 0) {
    where.AND = where.AND ?? [];
    for (const [key, val] of Object.entries(attrFilters)) {
      where.AND.push({
        productAttributes: {
          path: [key],
          string_contains: val,
        },
      });
    }
  }

  // If DATABASE_URL is not configured, show a clear fallback instead of crashing.
  // Set DATABASE_URL in your environment (e.g. Render dashboard) for full functionality.
  if (!isDatabaseConfigured()) {
    return (
      <div className="card p-10 text-center text-slate-500">
        <p className="font-semibold text-slate-700 mb-1">Database not configured</p>
        <p className="text-sm">
          Product listings are unavailable.{' '}
          Set <code className="font-mono text-xs bg-slate-100 px-1 rounded">DATABASE_URL</code>{' '}
          to enable full functionality.
        </p>
      </div>
    );
  }

  let products;
  try {
    await expirePromotions();
    const now = new Date();
    products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: sp.q ? undefined : 60,
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            shopName: true,
            phoneVerified: true,
            verificationSubmission: {
              select: {
                status: true,
                eligibleToListAt: true,
                adminFallbackStatus: true,
              },
            },
          },
        },
        categoryRef: {
          select: {
            id: true,
            name: true,
            aliases: true,
          },
        },
        subcategoryRef: {
          select: {
            id: true,
            name: true,
            aliases: true,
            parent: {
              select: {
                id: true,
                name: true,
                aliases: true,
                parent: {
                  select: {
                    id: true,
                    name: true,
                    aliases: true,
                  },
                },
              },
            },
          },
        },
        promotions: {
          where: { status: 'ACTIVE', expiresAt: { gt: now } },
          orderBy: { expiresAt: 'desc' },
          take: 1,
        },
        cartInterest: {
          select: { totalAdds: true },
        },
      },
    });
    products = products.filter((product: any) => productMatchesSearch(product, sp.q));
    const promotionIds = products
      .map((product: any) => product.promotions[0]?.id)
      .filter(Boolean);
    if (promotionIds.length > 0) {
      await prisma.$transaction(
        promotionIds.map((promotionId: string) => (
          prisma.promotion.update({
            where: { id: promotionId },
            data: { impressionCount: { increment: 1 } },
          })
        )),
      );
    }
    // Sort a copy: featured (active promotion) products appear first
    products = [...products].sort((productA: any, productB: any) => {
      const aFeatured = productA.promotions.length > 0 ? 1 : 0;
      const bFeatured = productB.promotions.length > 0 ? 1 : 0;
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;
      return productB.createdAt.getTime() - productA.createdAt.getTime();
    });
  } catch (err: unknown) {
    // If tables don't exist yet (schema not initialized), show a clear actionable message
    // instead of crashing to the global error boundary.
    if (isSchemaNotInitializedError(err)) {
      return (
        <div className="card p-10 text-center text-slate-500">
          <p className="font-semibold text-slate-700 mb-1">Database schema not yet initialized</p>
          <p className="text-sm">
            The database is connected but the tables have not been created.{' '}
            If you deployed via Render, trigger a new deploy — the pre-deploy command applies committed
            migrations automatically when available. If you set up the service manually, set your
            Pre-Deploy Command to the guarded command from <code className="font-mono text-xs bg-slate-100 px-1 rounded">render.yaml</code>{' '}
            (see DEPLOYMENT.md for the full command and migration setup instructions).
          </p>
        </div>
      );
    }
    throw err;
  }

  if (!products.length) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 shadow-sm">
        {t('home.noProducts')}
      </div>
    );
  }

  const sellerIds = getUniqueSellerIds(products);
  const sellerResponseRates = await getSellerResponseStatsForSellers(sellerIds);

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p: any) => (
        <ProductCard
          key={p.id}
          p={{
            ...p,
            activePromotion: p.promotions[0] ?? null,
            sellerResponseRate: sellerResponseRates.get(p.sellerId)?.responseRate ?? null,
          }}
        />
      ))}
    </div>
  );
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams | Promise<SearchParams> }) {
  const sp = await searchParams;
  const { t } = await getServerTranslations();
  const session = await getServerSession(authOptions);
  const experienceRole = normalizeExperienceRole(session?.user?.role);
  if (experienceRole === 'admin') {
    redirect(getRoleDefaultPath(session?.user?.role));
  }
  const culturalMarketplaceHighlights = await CulturalMarketplaceHighlights();

  return (
    <main className="space-y-6 pb-6">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-6 shadow-sm sm:px-8 sm:py-8 lg:px-10 lg:py-10">
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top,_rgba(11,31,58,0.12),_transparent_60%)] lg:block" />
        <div className="max-w-3xl space-y-5">
          <div className="space-y-4">
            <h1 className="max-w-2xl text-3xl font-black tracking-tight text-slate-900 sm:text-5xl">{t('home.title')}</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-lg">{t('home.subtitle')}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="#featured-products" className="btn-brand">
              {t('home.shopNow')}
              <ArrowRight size={16} />
            </Link>
            <Link href="/signup" className="btn-brand-outline">
              {t('home.startSelling')}
            </Link>
          </div>
        </div>
      </section>

      <section id="featured-products" className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">{t('home.featuredEyebrow')}</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{t('home.featuredTitle')}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t('home.featuredSubtitle')}</p>
          </div>
        </div>

        <Suspense>
          <BrowseFilters />
        </Suspense>
        <Suspense fallback={<p className="text-slate-500">{t('home.loadingProducts')}</p>}>
          <ProductGrid sp={sp} t={t} />
        </Suspense>
      </section>

      {culturalMarketplaceHighlights}

      <p className="text-center text-xs text-slate-500 sm:text-sm">
        Verified sellers. Secure payments. Buyer protection.
      </p>
    </main>
  );
}
