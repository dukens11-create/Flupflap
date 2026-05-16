import { prisma } from '@/lib/db';
import { getMarketplaceSettings } from '@/lib/commission';
import {
  DEFAULT_GARAGE_SALE_PRICING_SETTINGS,
  type GarageSalePricingSettings,
} from '@/lib/garage-sale-pricing';

export async function getGarageSalePricingSettings(): Promise<GarageSalePricingSettings> {
  const settings = await getMarketplaceSettings();

  return {
    standardPriceCents: settings.garageStandardPriceCents,
    featuredPriceCents: settings.garageFeaturedPriceCents,
    homepagePromoEnabled: settings.garageHomepagePromoEnabled,
    homepagePromoCents: settings.garageHomepagePromoCents,
    topSearchEnabled: settings.garageTopSearchEnabled,
    topSearchCents: settings.garageTopSearchCents,
    firstListingFree: settings.garageFirstListingFree,
  };
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
