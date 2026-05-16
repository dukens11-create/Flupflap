import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { calculateGarageSalePricing } from '@/lib/garage-sale-pricing';
import { getGarageSalePricingSettings } from '@/lib/garage-sales';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const listingType = url.searchParams.get('listingType') === 'FEATURED' ? 'FEATURED' : 'STANDARD';
  const startDateRaw = url.searchParams.get('startDate');
  const endDateRaw = url.searchParams.get('endDate');
  const homepagePromotion = url.searchParams.get('homepagePromotion') === 'true';
  const topLocalSearchPlacement = url.searchParams.get('topLocalSearchPlacement') === 'true';

  const pricingSettings = await getGarageSalePricingSettings();

  const session = await getServerSession(authOptions);
  let isEligibleForFreeFirstListing = false;
  if (session?.user?.id) {
    const paidCount = await prisma.garageSale.count({ where: { sellerId: session.user.id, paymentStatus: 'PAID' } });
    isEligibleForFreeFirstListing = paidCount === 0;
  }

  const response: Record<string, unknown> = {
    settings: pricingSettings,
    isEligibleForFreeFirstListing,
  };

  if (startDateRaw && endDateRaw) {
    const startDate = new Date(startDateRaw);
    const endDate = new Date(endDateRaw);
    if (Number.isFinite(startDate.getTime()) && Number.isFinite(endDate.getTime())) {
      response.estimate = calculateGarageSalePricing({
        listingType,
        startDate,
        endDate,
        homepagePromotion,
        topLocalSearchPlacement,
        settings: pricingSettings,
        isEligibleForFreeFirstListing,
      });
    }
  }

  return NextResponse.json(response);
}
