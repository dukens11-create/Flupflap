import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, isDatabaseConfigured } from '@/lib/db';
import GarageSaleCard from '@/components/GarageSaleCard';
import GarageSaleBrowseClient from './GarageSaleBrowseClient';
import { buildPublicGarageSaleWhere, expireGarageSales, batchGetLiveViewerCounts } from '@/lib/garage-sales';
import { createPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

interface SearchParams {
  q?: string;
  city?: string;
  zip?: string;
  state?: string;
  saleType?: string;
  category?: string;
  date?: string;
  sort?: string;
  radius?: string;
  live?: string;
  page?: string;
}

function hasSearchParamValue(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.some((entry) => entry.trim().length > 0);
  return typeof value === 'string' && value.trim().length > 0;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const hasFilters = Object.values(sp).some((value) => hasSearchParamValue(value));

  return createPageMetadata({
    title: 'Garage Sales Near You | FlupFlap',
    description: 'Discover verified local garage, yard, estate, and moving sales near you on FlupFlap.',
    path: '/garage-sales',
    noIndex: hasFilters,
  });
}

const RADIUS_OPTIONS = [
  { label: 'Closest', value: '10' },
  { label: '25 miles', value: '25' },
  { label: '50 miles', value: '50' },
  { label: 'Far', value: '100' },
  { label: '250 miles', value: '250' },
  { label: 'Nationwide', value: '99999' },
];

const DATE_FILTERS = [
  { label: 'Any Date', value: '' },
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'This Weekend', value: 'weekend' },
  { label: 'Open Now', value: 'open_now' },
  { label: 'Starting Soon', value: 'starting_soon' },
];

const SORT_OPTIONS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Closest', value: 'closest' },
  { label: 'Most Viewed', value: 'most_viewed' },
  { label: 'Featured', value: 'featured' },
  { label: 'Start Date', value: 'start_date' },
];

const SALE_TYPES = [
  { label: 'All Types', value: '' },
  { label: 'Garage Sale', value: 'GARAGE_SALE' },
  { label: 'Yard Sale', value: 'YARD_SALE' },
  { label: 'Estate Sale', value: 'ESTATE_SALE' },
  { label: 'Moving Sale', value: 'MOVING_SALE' },
];

const CATEGORIES = [
  { label: 'All Categories', value: '' },
  { label: 'Furniture', value: 'furniture' },
  { label: 'Electronics', value: 'electronics' },
  { label: 'Clothing', value: 'clothing' },
  { label: 'Tools', value: 'tools' },
  { label: 'Toys', value: 'toys' },
  { label: 'Baby Items', value: 'baby_items' },
  { label: 'Appliances', value: 'appliances' },
  { label: 'Collectibles', value: 'collectibles' },
  { label: 'Automotive', value: 'automotive' },
  { label: 'Miscellaneous', value: 'miscellaneous' },
];

export default async function GarageSalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10));
  const perPage = 24;
  const now = new Date();

  let sales: Awaited<ReturnType<typeof prisma.garageSale.findMany>> = [];
  let total = 0;
  let dbError = false;
  let viewerCountMap = new Map<string, number>();

  if (isDatabaseConfigured()) {
    try {
      await expireGarageSales();
      const where = buildWhere(sp, now);
      const orderBy = buildOrderBy(sp.sort ?? 'newest');
      [sales, total] = await Promise.all([
        prisma.garageSale.findMany({
          where,
          include: {
            seller: { select: { id: true, name: true, shopName: true, profileImageUrl: true, phoneVerified: true } },
            _count: { select: { favorites: true } },
          },
          orderBy,
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.garageSale.count({ where }),
      ]);

      // Batch-fetch viewer counts for live sales (single query, avoids N+1)
      const liveSaleIds = sales.filter(s => s.isLive).map(s => s.id);
      if (liveSaleIds.length > 0) {
        viewerCountMap = await batchGetLiveViewerCounts(liveSaleIds);
      }
    } catch {
      dbError = true;
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // Merge viewer counts into sales data for the client component
  const salesWithViewers = sales.map(s => ({
    ...s,
    liveViewerCount: s.isLive ? (viewerCountMap.get(s.id) ?? 0) : undefined,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">🏡 Garage Sales Near You</h1>
          <p className="mt-1 text-sm text-slate-500">Find local garage, yard, estate, and moving sales</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/garage-sales/archived" className="btn-outline shrink-0 text-sm">
            Archived
          </Link>
          <Link href="/garage-sales/new" className="btn-brand shrink-0">
            + Post a Sale
          </Link>
        </div>
      </div>

      {/* Client-side search & map component */}
      <GarageSaleBrowseClient
        initialSales={JSON.parse(JSON.stringify(salesWithViewers))}
        initialTotal={total}
        initialPage={page}
        totalPages={totalPages}
        perPage={perPage}
        searchParams={sp as Record<string, string | undefined>}
        radiusOptions={RADIUS_OPTIONS}
        dateFilters={DATE_FILTERS}
        sortOptions={SORT_OPTIONS}
        saleTypes={SALE_TYPES}
        categories={CATEGORIES}
        dbError={dbError}
      />
    </div>
  );
}

function buildWhere(sp: SearchParams, now: Date) {
  const where: Record<string, unknown> = buildPublicGarageSaleWhere(now);

  if (sp.q) {
    where.OR = [
      { title: { contains: sp.q, mode: 'insensitive' } },
      { description: { contains: sp.q, mode: 'insensitive' } },
      { city: { contains: sp.q, mode: 'insensitive' } },
    ];
  }
  if (sp.city) where.city = { contains: sp.city, mode: 'insensitive' };
  if (sp.zip) where.zipCode = { contains: sp.zip, mode: 'insensitive' };
  if (sp.state) where.state = { contains: sp.state, mode: 'insensitive' };
  if (sp.saleType && ['GARAGE_SALE', 'YARD_SALE', 'ESTATE_SALE', 'MOVING_SALE'].includes(sp.saleType)) {
    where.saleType = sp.saleType;
  }
  if (sp.category) where.categories = { has: sp.category };

  // Only show live sales when the live filter is active
  if (sp.live === 'true') where.isLive = true;

  // Date-range filters — each branch sets startDate (and endDate where needed).
  // Note: buildPublicGarageSaleWhere already provides OR: [{ isLive: true }, { endDate: { gte: now } }]
  // so we don't need an extra top-level endDate constraint for the default case — that would
  // create an AND that neutralises the isLive OR branch for live sales with a past endDate.
  if (sp.date === 'today') {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    where.startDate = { gte: dayStart, lte: dayEnd };
  } else if (sp.date === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    where.startDate = {
      gte: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()),
      lte: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59),
    };
  } else if (sp.date === 'weekend') {
    const day = now.getDay();
    const sat = new Date(now);
    sat.setDate(now.getDate() + (day === 6 ? 0 : 6 - day));
    sat.setHours(0, 0, 0, 0);
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    sun.setHours(23, 59, 59, 999);
    // Sale must start by end of Sunday and end on or after Saturday (or now if later)
    where.startDate = { lte: sun };
    where.endDate = { gte: sat > now ? sat : now };
  } else if (sp.date === 'open_now') {
    where.startDate = { lte: now };
  } else if (sp.date === 'starting_soon') {
    const soon = new Date(now);
    soon.setHours(now.getHours() + 24);
    where.startDate = { gte: now, lte: soon };
  }
  // Default (no date filter): buildPublicGarageSaleWhere's OR already handles endDate >= now

  return where;
}

function buildOrderBy(sort: string) {
  if (sort === 'most_viewed') return [{ isFeatured: 'desc' as const }, { viewCount: 'desc' as const }];
  if (sort === 'featured') return [{ isFeatured: 'desc' as const }, { createdAt: 'desc' as const }];
  if (sort === 'start_date') return [{ isFeatured: 'desc' as const }, { startDate: 'asc' as const }];
  return [{ isFeatured: 'desc' as const }, { createdAt: 'desc' as const }];
}
