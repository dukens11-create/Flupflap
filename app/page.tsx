import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { prisma, isDatabaseConfigured } from '@/lib/db';
import ProductCard from '@/components/ProductCard';
import BrowseFilters from '@/components/BrowseFilters';
import type { Metadata } from 'next';
import { expirePromotions } from '@/lib/promotions';
import { getServerTranslations } from '@/lib/i18n/server';
import { BadgeCheck, CreditCard, ShieldCheck, Truck } from 'lucide-react';
import { getSellerResponseStatsForSellers } from '@/lib/messages';
import { authOptions } from '@/lib/auth-options';
import { getRoleDefaultPath, normalizeExperienceRole } from '@/lib/role-experience';
import {
  buildProductSearchableText,
  normalizeSearchText,
  searchTextMatchesQuery,
  searchTextMatchesQueryWithoutFuzzy,
} from '@/lib/smart-search';

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

const TRUST_SIGNALS = [
  {
    titleKey: 'home.trustBadges.verifiedSellers.title',
    descriptionKey: 'home.trustBadges.verifiedSellers.description',
    icon: BadgeCheck,
    accentClassName: 'bg-emerald-50 text-emerald-700',
  },
  {
    titleKey: 'home.trustBadges.securePayments.title',
    descriptionKey: 'home.trustBadges.securePayments.description',
    icon: CreditCard,
    accentClassName: 'bg-slate-100 text-slate-700',
  },
  {
    titleKey: 'home.trustBadges.shippingSupport.title',
    descriptionKey: 'home.trustBadges.shippingSupport.description',
    icon: Truck,
    accentClassName: 'bg-amber-100 text-amber-700',
  },
  {
    titleKey: 'home.trustBadges.buyerProtection.title',
    descriptionKey: 'home.trustBadges.buyerProtection.description',
    icon: ShieldCheck,
    accentClassName: 'bg-blue-100 text-blue-700',
  },
] as const;

function getUniqueSellerIds(products: Array<{ sellerId: string }>) {
  return Array.from(new Set(products.map((product) => product.sellerId)));
}

type SearchableProduct = {
  title: string;
  description: string;
  condition: string;
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

function getSearchableTextFromAttributes(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return typeof (value as Record<string, unknown>).searchableText === 'string'
    ? String((value as Record<string, unknown>).searchableText)
    : '';
}

function getCategoryPathForSearch(product: SearchableProduct) {
  const candidates = [
    product.categoryRef?.name,
    product.subcategoryRef?.parent?.parent?.name,
    product.subcategoryRef?.parent?.name,
    product.subcategoryRef?.name,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  const path = candidates.filter((value, index) => candidates.indexOf(value) === index);

  return path.length > 0 ? path.join(' > ') : product.category;
}

function productMatchesSearch(product: SearchableProduct, query?: string, useFuzzy = false) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const attributes =
    product.productAttributes && typeof product.productAttributes === 'object' && !Array.isArray(product.productAttributes)
      ? (product.productAttributes as Record<string, unknown>)
      : {};
  const existingSearchableText = getSearchableTextFromAttributes(product.productAttributes);

  const fallbackSearchableText = buildProductSearchableText({
    title: product.title,
    description: product.description,
    brand: typeof attributes.brand === 'string' ? attributes.brand : null,
    condition: product.condition,
    categoryName: product.category,
    categoryPath: getCategoryPathForSearch(product),
    tags: attributes.tags,
    keywords: attributes.keywords,
  });

  const searchableText = existingSearchableText || fallbackSearchableText;
  if (!useFuzzy) {
    return searchTextMatchesQueryWithoutFuzzy(searchableText, normalizedQuery);
  }
  return searchTextMatchesQuery(searchableText, normalizedQuery);
}

async function ProductGrid({ sp, t }: { sp: SearchParams; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const where: any = { status: { in: ['APPROVED', 'ACTIVE'] }, inventory: { gt: 0 } };

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
            profileImageUrl: true,
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
    console.log('rawQuery', sp.q ?? '');
    console.log('normalizedQuery', normalizeSearchText(sp.q));
    const normalizedQuery = normalizeSearchText(sp.q);
    const allProducts = products;
    products = allProducts.filter((product: any) => productMatchesSearch(product, sp.q, false));
    if (normalizedQuery && products.length === 0) {
      products = allProducts.filter((product: any) => productMatchesSearch(product, sp.q, true));
    }
    console.log('matchedProducts', products.length);
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
    <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
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

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { t } = await getServerTranslations();
  const session = await getServerSession(authOptions);
  const experienceRole = normalizeExperienceRole(session?.user?.role);
  
  if (experienceRole === 'admin') {
    redirect(getRoleDefaultPath(session?.user?.role));
  }

  return (
    <main className="space-y-8 pb-28 md:pb-0">
      <section id="search-marketplace" className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">{t('home.searchSectionEyebrow')}</p>
          <h2 className="text-3xl font-black tracking-tight text-slate-900">{t('home.searchSectionTitle')}</h2>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">
            {t('home.searchSectionSubtitle')}
          </p>
        </div>
        <Suspense>
          <BrowseFilters />
        </Suspense>
      </section>

      <section id="promotional-banner">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_16px_36px_-20px_rgba(15,23,42,0.5)] sm:p-4">
          <div className="relative h-52 w-full sm:h-64 md:h-72 lg:h-80 xl:h-[24rem]">
            <Image
              src="/promotional_imagine.png"
              alt="FlupFlap promotional banner"
              fill
              priority
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px"
              className="object-contain object-center"
            />
          </div>
        </div>
      </section>

      <section id="garage-sales-banner">
        <Link
          href="/garage-sales/create"
          className="group block overflow-hidden rounded-[28px] shadow-[0_16px_36px_-20px_rgba(15,23,42,0.5)] transition-shadow hover:shadow-[0_20px_42px_-20px_rgba(15,23,42,0.55)]"
          aria-label="Go to Garage Sales creation page"
        >
          <div className="rounded-[28px] border border-slate-200 bg-white p-3 sm:p-4">
            <div className="relative h-36 w-full sm:h-48 md:h-56 lg:h-64">
              <Image
                src="/images/garage-sales-banner.png"
                alt="Garage Sales promotional banner"
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px"
                className="object-contain object-center"
              />
            </div>
          </div>
        </Link>
      </section>

      <section id="featured-products" className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">{t('home.featuredProductsEyebrow')}</p>
          <h2 className="text-3xl font-black tracking-tight text-slate-900">{t('home.featuredProductsTitle')}</h2>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">
            {t('home.featuredProductsSubtitle')}
          </p>
        </div>

        <Suspense fallback={<p className="text-slate-500">{t('home.loadingProducts')}</p>}>
          <ProductGrid sp={sp} t={t} />
        </Suspense>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">{t('home.whyShopEyebrow')}</p>
          <h2 className="text-3xl font-black tracking-tight text-slate-900">{t('home.whyShopTitle')}</h2>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">
            {t('home.whyShopSubtitle')}
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {TRUST_SIGNALS.map((signal) => {
            const Icon = signal.icon;
            return (
              <article key={signal.titleKey} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${signal.accentClassName}`}>
                  <Icon size={20} />
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">{t(signal.titleKey)}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{t(signal.descriptionKey)}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,rgba(249,115,22,0.08),rgba(255,255,255,1),rgba(15,138,95,0.1))] p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--ff-primary-navy)]">{t('home.sellingCtaEyebrow')}</p>
            <h2 className="text-3xl font-black tracking-tight text-slate-900">
              {t('home.sellingCtaTitle')}
            </h2>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              {t('home.sellingCtaSubtitle')}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="btn-brand">
              {t('home.startSelling')}
            </Link>
            <Link href="#search-marketplace" className="btn-brand-outline">
              {t('home.shopNow')}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
