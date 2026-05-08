import { Suspense } from 'react';
import { after } from 'next/server';
import { isDatabaseConfigured } from '@/lib/db';
import ProductCard from '@/components/ProductCard';
import BrowseFilters from '@/components/BrowseFilters';
import type { Metadata } from 'next';
import { getServerTranslations } from '@/lib/i18n/server';
import { getCachedCatalogProducts, type CatalogSearchParams } from '@/lib/catalog';
import { runPromotionMaintenance } from '@/lib/promotion-metrics-queue';

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

async function ProductGrid({ sp, t }: { sp: CatalogSearchParams; t: (key: string, vars?: Record<string, string | number>) => string }) {
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
    products = await getCachedCatalogProducts(sp);
    const promotionIds = products
      .map((product: any) => product.promotions[0]?.id)
      .filter(Boolean);
    if (promotionIds.length > 0) {
      after(async () => {
        await runPromotionMaintenance('impression', promotionIds);
      });
    } else {
      after(async () => {
        await runPromotionMaintenance();
      });
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
      <div className="card p-10 text-center text-slate-500">
        {t('home.noProducts')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map((p: any) => (
        <ProductCard key={p.id} p={{ ...p, activePromotion: p.promotions[0] ?? null }} />
      ))}
    </div>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
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
