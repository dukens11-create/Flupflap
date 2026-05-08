import { Suspense } from 'react';
import { prisma, isDatabaseConfigured } from '@/lib/db';
import ProductCard from '@/components/ProductCard';
import BrowseFilters from '@/components/BrowseFilters';
import type { Metadata } from 'next';
import { expirePromotions } from '@/lib/promotions';
import { getServerTranslations } from '@/lib/i18n/server';

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
  location?: string;
  category?: string;
  condition?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
}

function parsePriceBound(value?: string): number | undefined {
  if (!value) return undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return Math.round(amount * 100);
}

function getPromotionScore(promotions: Array<{ impressionCount: number; clickCount: number; saleCount: number }>) {
  return promotions.reduce(
    (score, promotion) => score + promotion.impressionCount + (promotion.clickCount * 5) + (promotion.saleCount * 25),
    0,
  );
}

function getActivePromotion<T extends { id: string; status: string; expiresAt: Date | null }>(promotions: T[], now: Date) {
  return promotions.find((promotion) => promotion.status === 'ACTIVE' && promotion.expiresAt && promotion.expiresAt > now) ?? null;
}

async function ProductGrid({ sp, t }: { sp: SearchParams; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const filters: Record<string, unknown>[] = [];
  const query = sp.q?.trim();
  const location = sp.location?.trim();
  const sort = sp.sort === 'popular' ? 'popular' : 'newest';

  if (query) {
    filters.push({
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } },
        { condition: { contains: query, mode: 'insensitive' } },
        { pickupCity: { contains: query, mode: 'insensitive' } },
        { pickupState: { contains: query, mode: 'insensitive' } },
      ],
    });
  }
  if (sp.category) filters.push({ category: sp.category });
  if (sp.condition) filters.push({ condition: sp.condition });
  if (location) {
    filters.push({
      pickupAvailable: true,
      OR: [
        { pickupCity: { contains: location, mode: 'insensitive' } },
        { pickupState: { contains: location, mode: 'insensitive' } },
      ],
    });
  }

  let minPriceCents = parsePriceBound(sp.minPrice);
  let maxPriceCents = parsePriceBound(sp.maxPrice);
  if (minPriceCents !== undefined && maxPriceCents !== undefined && minPriceCents > maxPriceCents) {
    [minPriceCents, maxPriceCents] = [maxPriceCents, minPriceCents];
  }
  if (minPriceCents !== undefined || maxPriceCents !== undefined) {
    filters.push({
      priceCents: {
        ...(minPriceCents !== undefined ? { gte: minPriceCents } : {}),
        ...(maxPriceCents !== undefined ? { lte: maxPriceCents } : {}),
      },
    });
  }

  const where: Record<string, unknown> = {
    status: 'APPROVED',
    ...(filters.length > 0 ? { AND: filters } : {}),
  };

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
      orderBy: sort === 'popular'
        ? [
            { orderItems: { _count: 'desc' } },
            { createdAt: 'desc' },
          ]
        : { createdAt: 'desc' },
      take: 60,
      include: {
        promotions: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
            impressionCount: true,
            clickCount: true,
            saleCount: true,
          },
        },
        _count: {
          select: {
            orderItems: true,
          },
        },
      },
    });
    const promotionIds = products
      .map((product: any) => getActivePromotion(product.promotions, now)?.id)
      .filter((promotionId): promotionId is string => Boolean(promotionId));
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
    products = [...products].sort((productA: any, productB: any) => {
      if (sort === 'popular') {
        const purchaseDelta = productB._count.orderItems - productA._count.orderItems;
        if (purchaseDelta !== 0) return purchaseDelta;

        const promotionDelta = getPromotionScore(productB.promotions) - getPromotionScore(productA.promotions);
        if (promotionDelta !== 0) return promotionDelta;
      }

      const aFeatured = getActivePromotion(productA.promotions, now) ? 1 : 0;
      const bFeatured = getActivePromotion(productB.promotions, now) ? 1 : 0;
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
      <div className="card p-10 text-center text-slate-500">
        {t('home.noProducts')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map((p: any) => (
        <ProductCard
          key={p.id}
          p={{
            ...p,
            activePromotion: getActivePromotion(p.promotions, new Date()),
          }}
        />
      ))}
    </div>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { t } = await getServerTranslations();
  return (
    <main>
      <div className="mb-6">
        <h1 className="text-3xl font-black">{t('home.title')}</h1>
        <p className="text-slate-500 mt-1">{t('home.subtitle')}</p>
      </div>
      <Suspense>
        <BrowseFilters />
      </Suspense>
      <Suspense fallback={<p className="text-slate-500">{t('home.loadingProducts')}</p>}>
        <ProductGrid sp={sp} t={t} />
      </Suspense>
    </main>
  );
}
