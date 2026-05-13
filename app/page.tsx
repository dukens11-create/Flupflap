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
import { ArrowRight, BadgeCheck, CreditCard, Palette, ShieldCheck, Sparkles, Store, Sun, Truck } from 'lucide-react';
import { getSellerResponseStatsForSellers } from '@/lib/messages';
import { authOptions } from '@/lib/auth-options';
import { getRoleDefaultPath, normalizeExperienceRole } from '@/lib/role-experience';
import { DEFAULT_CATEGORY_TREE, type DefaultCategoryNode } from '@/lib/default-categories';
import { FEATURED_MARKETPLACE_CATEGORY_SLUGS } from '@/lib/marketplace-categories';

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

const CULTURE_CARD_CONTENT = {
  'asian-products': {
    descriptionKey: 'home.cultureCards.asian.description',
    chips: ['Fashion', 'Beauty', 'Snacks', 'Electronics'],
    badgeKey: 'home.cultureCards.asian.badge',
    icon: Sparkles,
    iconClassName: 'bg-amber-100 text-amber-700',
    buttonClassName: 'bg-amber-500 text-white hover:bg-amber-600',
  },
  'african-products': {
    descriptionKey: 'home.cultureCards.african.description',
    chips: ['Fashion', 'Fabrics', 'Jewelry', 'Art'],
    badgeKey: 'home.cultureCards.african.badge',
    icon: Palette,
    iconClassName: 'bg-emerald-100 text-emerald-700',
    buttonClassName: 'bg-emerald-600 text-white hover:bg-emerald-700',
  },
  'caribbean-products': {
    descriptionKey: 'home.cultureCards.caribbean.description',
    chips: ['Haitian', 'Jamaican', 'Dominican', 'Trinidadian'],
    badgeKey: 'home.cultureCards.caribbean.badge',
    icon: Sun,
    iconClassName: 'bg-orange-100 text-orange-700',
    buttonClassName: 'bg-[var(--ff-primary-navy)] text-white hover:bg-[var(--ff-hover-navy)]',
  },
} as const;

function findCategoryBySlug(
  nodes: DefaultCategoryNode[],
  slug: string,
): DefaultCategoryNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const child = findCategoryBySlug(node.children, slug);
    if (child) return child;
  }
  return null;
}

function getFeaturedMarketplaceCategories() {
  return FEATURED_MARKETPLACE_CATEGORY_SLUGS
    .map((slug) => findCategoryBySlug(DEFAULT_CATEGORY_TREE, slug))
    .filter((category): category is DefaultCategoryNode => Boolean(category));
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

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { t } = await getServerTranslations();
  const session = await getServerSession(authOptions);
  const experienceRole = normalizeExperienceRole(session?.user?.role);
  const featuredMarketplaceCategories = getFeaturedMarketplaceCategories();
  const heroExperienceCards = [
    {
      title: t('home.heroExperienceCards.discovery.title'),
      description: t('home.heroExperienceCards.discovery.description'),
      accentClassName: 'bg-amber-100 text-amber-700',
    },
    {
      title: t('home.heroExperienceCards.shopping.title'),
      description: t('home.heroExperienceCards.shopping.description'),
      accentClassName: 'bg-emerald-100 text-emerald-700',
    },
    {
      title: t('home.heroExperienceCards.checkout.title'),
      description: t('home.heroExperienceCards.checkout.description'),
      accentClassName: 'bg-slate-100 text-slate-700',
    },
  ];
  if (experienceRole === 'admin') {
    redirect(getRoleDefaultPath(session?.user?.role));
  }

  return (
    <main className="space-y-8 pb-8">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,#0B1F3A_0%,#17345F_55%,#F97316_130%)] text-white shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_transparent_34%)]" />
        <div className="absolute -right-16 top-8 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-orange-300/20 blur-3xl" />
        <div className="relative grid gap-8 px-5 py-7 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:px-10">
          <div className="space-y-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/90">
              <Store size={14} />
              {t('home.heroBadge')}
            </div>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
                {t('home.title')}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-white/85 sm:text-lg sm:leading-7">
                {t('home.subtitle')}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="#featured-products" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[var(--ff-primary-navy)] shadow-sm transition-colors hover:bg-slate-100">
                {t('home.shopNow')}
                <ArrowRight size={16} />
              </Link>
              <Link href="/signup" className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15">
                {t('home.startSelling')}
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {TRUST_SIGNALS.map((signal) => (
                <div key={signal.titleKey} className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 text-sm font-medium text-white/90 backdrop-blur-sm">
                  {t(signal.titleKey)}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/15 bg-white/95 p-5 text-slate-900 shadow-xl sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {t('home.heroExperienceEyebrow')}
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">
              {t('home.heroExperienceTitle')}
            </h2>
            <div className="mt-5 space-y-3">
              {heroExperienceCards.map((item) => (
                <div key={item.title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.accentClassName}`}>
                    <BadgeCheck size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

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

      {featuredMarketplaceCategories.length > 0 && (
        <section className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">{t('home.cultureSectionEyebrow')}</p>
            <h2 className="text-3xl font-black tracking-tight text-slate-900">{t('home.cultureSectionTitle')}</h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              {t('home.cultureSectionSubtitle')}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {featuredMarketplaceCategories.map((category) => {
              const cardContent = CULTURE_CARD_CONTENT[category.slug as keyof typeof CULTURE_CARD_CONTENT];
              const Icon = cardContent?.icon ?? Store;
              const chips = cardContent?.chips ?? category.children.slice(0, 4).map((subcategory) => subcategory.name);

              return (
                <article
                  key={category.id}
                  className="flex h-full flex-col rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                      {cardContent ? t(cardContent.badgeKey) : t('home.cultureSectionEyebrow')}
                    </span>
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${cardContent?.iconClassName ?? 'bg-slate-100 text-slate-700'}`}>
                      <Icon size={22} />
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    <h3 className="text-2xl font-black tracking-tight text-slate-900">
                      {category.icon ? `${category.icon} ` : ''}
                      {category.name}
                    </h3>
                    <p className="text-sm leading-6 text-slate-500">
                      {cardContent ? t(cardContent.descriptionKey) : t('home.cultureSectionSubtitle')}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>

                  <Link
                    href={`/category/${category.slug}`}
                    className={`mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${cardContent?.buttonClassName ?? 'bg-[var(--ff-primary-navy)] text-white hover:bg-[var(--ff-hover-navy)]'}`}
                    aria-label={`Explore ${category.name}`}
                  >
                    {t('home.explore')}
                    <ArrowRight size={16} />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      )}

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
