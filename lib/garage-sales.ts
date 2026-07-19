import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logInfo, logWarn } from '@/lib/logger';
import { DEFAULT_GARAGE_SALE_PRICING_SETTINGS, type GarageSalePricingSettings } from '@/lib/garage-sale-pricing';

// Matches the window used in the live signaling route (35-second active heartbeat window)
const ACTIVE_VIEWER_WINDOW_MS = 35_000;

export async function getGarageSalePricingSettings(): Promise<GarageSalePricingSettings> {
  try {
    const dbSettings = await prisma.marketplaceSettings.findUnique({ where: { id: 1 } });
    if (dbSettings) {
      return {
        standardPriceCents: dbSettings.garageStandardPriceCents,
        featuredPriceCents: dbSettings.garageFeaturedPriceCents,
        homepagePromoEnabled: dbSettings.garageHomepagePromoEnabled,
        homepagePromoCents: dbSettings.garageHomepagePromoCents,
        topSearchEnabled: dbSettings.garageTopSearchEnabled,
        topSearchCents: dbSettings.garageTopSearchCents,
        firstListingFree: dbSettings.garageFirstListingFree,
        garageSalesFree: dbSettings.garageSalesFree,
      };
    }
  } catch {
    // Fall through to defaults if DB is unavailable
  }
  return { ...DEFAULT_GARAGE_SALE_PRICING_SETTINGS };
}

export function getDefaultGarageSalePricingSettings(): GarageSalePricingSettings {
  return { ...DEFAULT_GARAGE_SALE_PRICING_SETTINGS };
}

export async function expireGarageSales(now = new Date()) {
  // Exclude currently-live sessions so that an active live stream is never
  // archived mid-broadcast just because the scheduled endDate has passed.
  // The live API end action will handle deferred archival once the seller
  // explicitly closes their session.
  const expired = await prisma.garageSale.updateMany({
    where: {
      status: { in: ['APPROVED', 'PENDING', 'HIDDEN'] },
      endDate: { lt: now },
      isArchived: false,
      isLive: false,
    },
    data: {
      status: 'EXPIRED',
      isArchived: true,
      archivedAt: now,
      isFeatured: false,
    },
  });

  return expired.count;
}

const GARAGE_SALE_ID_PATTERN = /c[a-z0-9]{24,}/;

export function buildPublicGarageSaleWhere(now = new Date()) {
  return {
    isSpam: false,
    isArchived: false,
    paymentStatus: 'PAID' as const,
    status: 'APPROVED' as const,
    OR: [
      { isLive: true },
      { endDate: { gte: now } },
    ],
  };
}

/**
 * Batch-fetches active viewer counts for a list of live sale IDs.
 * Uses a single SQL query to avoid N+1 DB calls in listing/browse views.
 * Returns a Map of saleId → viewer count (only entries with count > 0 are included).
 */
export async function batchGetLiveViewerCounts(saleIds: string[]): Promise<Map<string, number>> {
  if (saleIds.length === 0) return new Map();

  // Validate IDs to prevent unexpected input reaching the raw SQL query.
  // Prisma cuids are exactly 25 characters: 'c' followed by 24 lowercase alphanumeric chars.
  const safeIds = saleIds.filter(id => /^c[a-z0-9]{24}$/.test(id));
  if (safeIds.length === 0) return new Map();

  const activeSince = new Date(Date.now() - ACTIVE_VIEWER_WINDOW_MS);

  const rows = await prisma.$queryRaw<Array<{ saleId: string; viewerCount: bigint | number }>>(
    Prisma.sql`
      SELECT "saleId", COUNT(DISTINCT payload->>'viewerId') AS "viewerCount"
      FROM "GarageSaleLiveSignal"
      WHERE "saleId" = ANY(${safeIds}::text[])
        AND sender = 'BUYER'
        AND kind = 'VIEWER_HEARTBEAT'
        AND "createdAt" >= ${activeSince}
        AND COALESCE(payload->>'viewerId', '') <> ''
      GROUP BY "saleId"
    `,
  );

  const map = new Map<string, number>();
  for (const row of rows) {
    const count = typeof row.viewerCount === 'bigint' ? Number(row.viewerCount) : row.viewerCount;
    if (count > 0) map.set(row.saleId, count);
  }
  return map;
}

export function extractGarageSaleId(routeParam: string) {
  const trimmed = routeParam.trim();
  if (!trimmed) return null;

  if (GARAGE_SALE_ID_PATTERN.test(trimmed)) {
    return trimmed.match(GARAGE_SALE_ID_PATTERN)?.[0] ?? trimmed;
  }

  return null;
}

export async function resolveGarageSaleByRouteParam(routeParam: string, tag: string) {
  const extractedId = extractGarageSaleId(routeParam);

  if (!extractedId) {
    logWarn('Garage sale route param is invalid', {
      tag,
      routeParam,
    });
    return null;
  }

  const sale = await prisma.garageSale.findUnique({
    where: { id: extractedId },
  });

  if (!sale) {
    logWarn('Garage sale route param did not resolve to a listing', {
      tag,
      routeParam,
      extractedId,
    });
    return null;
  }

  if (routeParam !== sale.id) {
    logInfo('Redirecting garage sale route param to canonical path', {
      tag,
      routeParam,
      canonicalId: sale.id,
    });
  }

  return sale;
}
