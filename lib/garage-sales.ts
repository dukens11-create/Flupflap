import { prisma } from '@/lib/db';
import { logInfo, logWarn } from '@/lib/logger';
import {
  DEFAULT_GARAGE_SALE_PRICING_SETTINGS,
  type GarageSalePricingSettings,
} from '@/lib/garage-sale-pricing';

export async function getGarageSalePricingSettings(): Promise<GarageSalePricingSettings> {
  return { ...DEFAULT_GARAGE_SALE_PRICING_SETTINGS };
}

export function getDefaultGarageSalePricingSettings(): GarageSalePricingSettings {
  return { ...DEFAULT_GARAGE_SALE_PRICING_SETTINGS };
}

export async function expireGarageSales(now = new Date()) {
  const expired = await prisma.garageSale.updateMany({
    where: {
      status: { in: ['APPROVED', 'PENDING', 'HIDDEN'] },
      endDate: { lt: now },
      isArchived: false,
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
    status: 'APPROVED' as const,
    isSpam: false,
    paymentStatus: 'PAID' as const,
    endDate: { gte: now },
  };
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
