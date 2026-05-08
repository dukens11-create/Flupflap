import { Suspense } from 'react';
import Link from 'next/link';
import { prisma, isDatabaseConfigured } from '@/lib/db';
import ProductCard from '@/components/ProductCard';
import BrowseFilters from '@/components/BrowseFilters';
import type { Metadata } from 'next';
import { expirePromotions } from '@/lib/promotions';
import { getServerTranslations } from '@/lib/i18n/server';
import { ArrowRight, BadgeCheck, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import { getSellerResponseStats } from '@/lib/messages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Browse Products' };

/**
 * Returns true when a Prisma/Postgres error indicates the schema has not been
 * applied yet (tables or columns are missing). This lets the homepage show a
 * clear, actionable message instead of crashing to the global error boundary.
 *
 * Common causes: first deploy before `prisma db push` has run, or
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
  condition?: string;
  minPrice?: string;
  maxPrice?: string;
}

async function ProductGrid({ sp, t }: { sp: SearchParams; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const where: any = { status: 'APPROVED' };
  if (sp.q) where.title = { contains: sp.q, mode: 'insensitive' };
  if (sp.category) where.category = sp.category;
  if (sp.condition) where.condition = sp.condition;
  if (sp.minPrice || sp.maxPrice) {
    where.priceCents = {};
    if (sp.minPrice) where.priceCents.gte = Math.round(Number(sp.minPrice) * 100);
    if (sp.maxPrice) where.priceCents.lte = Math.round(Number(sp.maxPrice) * 100);
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
      take: 60,
      include: {
        seller: {
          select: {
            id: true,
            name: true,
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
          where: { status: 'ACTIVE', expiresAt: { gt: now } },
          orderBy: { expiresAt: 'desc' },
          take: 1,
        },
      },
    });
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
            If you deployed via Render, trigger a new deploy — the build command will apply the
            schema automatically. If you set up the service manually, make sure your build command
            includes{' '}
            <code className="font-mono text-xs bg-slate-100 px-1 rounded">
              {'if [ -n "$DATABASE_URL" ]; then npx prisma db push --skip-generate; fi'}
            </code>{' '}
            after{' '}
            <code className="font-mono text-xs bg-slate-100 px-1 rounded">npm run build</code>.
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

  const sellerIds = [...new Set(products.map((product: any) => product.sellerId))];
  const sellerResponseRates = new Map(
    await Promise.all(
      sellerIds.map(async (sellerId: string) => [sellerId, (await getSellerResponseStats(sellerId)).responseRate] as const),
    ),
  );

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p: any) => (
        <ProductCard
          key={p.id}
          p={{
            ...p,
            activePromotion: p.promotions[0] ?? null,
            sellerResponseRate: sellerResponseRates.get(p.sellerId) ?? null,
          }}
        />
      ))}
    </div>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { t } = await getServerTranslations();
  const trustBadges = [
    {
      key: 'verifiedSellers',
      icon: BadgeCheck,
      tone: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
    {
      key: 'securePayments',
      icon: CreditCard,
      tone: 'bg-amber-50 text-amber-700 border-amber-100',
    },
    {
      key: 'buyerProtection',
      icon: ShieldCheck,
      tone: 'bg-slate-100 text-slate-700 border-slate-200',
    },
  ] as const;

  return (
    <main className="space-y-8 pb-6">
      <section className="relative overflow-hidden rounded-[32px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-emerald-50 px-6 py-8 shadow-sm sm:px-8 lg:px-12 lg:py-12">
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_60%)] lg:block" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] lg:items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm ring-1 ring-amber-100">
              <Sparkles size={16} />
              {t('home.heroBadge')}
            </span>

            <div className="space-y-4">
              <h1 className="max-w-2xl text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">{t('home.title')}</h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">{t('home.subtitle')}</p>
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

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">{t('home.heroHighlights.discovery.title')}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{t('home.heroHighlights.discovery.description')}</p>
              </div>
              <div className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">{t('home.heroHighlights.trust.title')}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{t('home.heroHighlights.trust.description')}</p>
              </div>
              <div className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">{t('home.heroHighlights.fulfillment.title')}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{t('home.heroHighlights.fulfillment.description')}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">{t('home.featuredEyebrow')}</p>
              <h2 className="mt-2 text-2xl font-black text-slate-900">{t('home.featuredTitle')}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{t('home.featuredSubtitle')}</p>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">{t('home.trustTitle')}</p>
              <p className="mt-3 text-sm leading-6 text-slate-200">{t('home.trustSubtitle')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {trustBadges.map(({ key, icon: Icon, tone }) => (
          <div key={key} className={`rounded-[28px] border p-5 shadow-sm ${tone}`}>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/70 p-3">
                <Icon size={20} />
              </div>
              <div>
                <h2 className="font-semibold">{t(`home.trustBadges.${key}.title`)}</h2>
                <p className="mt-1 text-sm leading-6 opacity-90">{t(`home.trustBadges.${key}.description`)}</p>
              </div>
            </div>
          </div>
        ))}
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
    </main>
  );
}
