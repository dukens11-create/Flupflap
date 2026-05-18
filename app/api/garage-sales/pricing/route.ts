import { NextResponse } from 'next/server';
import { calculateGarageSalePricing } from '@/lib/garage-sale-pricing';
import { getGarageSalePricingSettings } from '@/lib/garage-sales';
import { getGarageSaleTimeValidationError } from '@/lib/garage-sale-time-validation';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const listingType = url.searchParams.get('listingType') === 'FEATURED' ? 'FEATURED' : 'STANDARD';
  const startDateRaw = url.searchParams.get('startDate');
  const endDateRaw = url.searchParams.get('endDate');
  const homepagePromotion = url.searchParams.get('homepagePromotion') === 'true';
  const topLocalSearchPlacement = url.searchParams.get('topLocalSearchPlacement') === 'true';

  const pricingSettings = await getGarageSalePricingSettings();

  const response: {
    settings: Awaited<ReturnType<typeof getGarageSalePricingSettings>>;
    estimate?: ReturnType<typeof calculateGarageSalePricing>;
    validationError?: string;
  } = {
    settings: pricingSettings,
  };

  if (startDateRaw && endDateRaw) {
    const startDate = new Date(startDateRaw);
    const endDate = new Date(endDateRaw);
    const validationError = getGarageSaleTimeValidationError(startDate, endDate);
    if (!validationError) {
      response.estimate = calculateGarageSalePricing({
        listingType,
        startDate,
        endDate,
        homepagePromotion,
        topLocalSearchPlacement,
        settings: pricingSettings,
      });
    } else {
      response.validationError = validationError;
    }
  }

  return NextResponse.json(response);
}
