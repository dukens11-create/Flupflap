import { Suspense } from 'react';
import { prisma, isDatabaseConfigured } from '@/lib/db';
import ProductCard from '@/components/ProductCard';
import BrowseFilters from '@/components/BrowseFilters';
import type { Metadata } from 'next';
import { expirePromotions } from '@/lib/promotions';
import { getServerTranslations } from '@/lib/i18n/server';
import FlupFlapLogo from '@/components/FlupFlapLogo';
import Link from 'next/link';
import { Tag, Zap, BookOpen, Shirt, Armchair, Camera } from 'lucide-react';

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

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { t } = await getServerTranslations();
  return (
    <main>
      {/* Hero section */}
      <section className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-6 mb-10 bg-gradient-to-br from-orange-50 via-white to-green-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 flex flex-col lg:flex-row items-center gap-10">
          {/* Left – branding + CTA */}
          <div className="flex-1 text-center lg:text-left">
            <div className="flex justify-center lg:justify-start mb-6">
              <FlupFlapLogo size="lg" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4 leading-tight">
              The Smarter Way to Buy&nbsp;and&nbsp;Sell
            </h1>
            <p className="text-lg text-slate-500 mb-8 max-w-md mx-auto lg:mx-0">
              Discover great deals, trusted sellers, and easy selling in one place.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link
                href="/signup"
                className="btn-brand px-7 py-3 text-base rounded-xl font-bold shadow-sm"
              >
                Start Selling
              </Link>
              <a
                href="#products"
                className="btn-outline px-7 py-3 text-base rounded-xl font-bold"
              >
                Browse Deals
              </a>
            </div>
          </div>

          {/* Right – category showcase */}
          <div className="flex-shrink-0 grid grid-cols-3 gap-3">
            {[
              { icon: Zap, label: 'Electronics', href: '/?category=Electronics', color: 'bg-orange-100 text-orange-600' },
              { icon: Shirt, label: 'Clothing', href: '/?category=Clothing', color: 'bg-green-100 text-green-700' },
              { icon: Armchair, label: 'Furniture', href: '/?category=Furniture', color: 'bg-amber-100 text-amber-700' },
              { icon: BookOpen, label: 'Books', href: '/?category=Books', color: 'bg-sky-100 text-sky-700' },
              { icon: Camera, label: 'Cameras', href: '/?category=Electronics', color: 'bg-purple-100 text-purple-700' },
              { icon: Tag, label: 'Deals', href: '/', color: 'bg-rose-100 text-rose-600' },
            ].map(({ icon: Icon, label, href, color }) => (
              <Link
                key={label}
                href={href}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-4 w-24 h-24 hover:scale-105 transition-transform ${color} bg-opacity-60`}
              >
                <Icon size={26} aria-hidden="true" />
                <span className="text-xs font-semibold text-center leading-tight">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Browse section */}
      <div id="products" className="mb-6">
        <h2 className="text-2xl font-black">{t('home.title')}</h2>
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
