import { NextResponse } from 'next/server';
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

  const response: Record<string, unknown> = {
    settings: pricingSettings,
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
      });
    }
  }

  return NextResponse.json(response);
}
