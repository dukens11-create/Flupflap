import { prisma } from '@/lib/db';
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
