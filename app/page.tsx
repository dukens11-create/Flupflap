import { Suspense } from 'react';
import { prisma, isDatabaseConfigured } from '@/lib/db';
import ProductCard from '@/components/ProductCard';
import BrowseFilters from '@/components/BrowseFilters';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Browse Products' };

interface SearchParams {
  q?: string;
  category?: string;
  condition?: string;
  minPrice?: string;
  maxPrice?: string;
}

async function ProductGrid({ sp }: { sp: SearchParams }) {
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

  const products = await prisma.product.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 60,
  });

  if (!products.length) {
    return (
      <div className="card p-10 text-center text-slate-500">
        No products found. Try adjusting your filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map(p => <ProductCard key={p.id} p={p} />)}
    </div>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  return (
    <main>
      <div className="mb-6">
        <h1 className="text-3xl font-black">FlupFlap Marketplace</h1>
        <p className="text-slate-500 mt-1">Buy and sell new &amp; used items</p>
      </div>
      <Suspense>
        <BrowseFilters />
      </Suspense>
      <Suspense fallback={<p className="text-slate-500">Loading products…</p>}>
        <ProductGrid sp={sp} />
      </Suspense>
    </main>
  );
}
