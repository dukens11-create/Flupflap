export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
export const GARAGE_SALE_FLAT_DAILY_PRICE_CENTS = 399;

export type GarageSaleListingType = 'STANDARD' | 'FEATURED';

export type GarageSalePricingSettings = {
  standardPriceCents: number;
  featuredPriceCents: number;
  homepagePromoEnabled: boolean;
  homepagePromoCents: number;
  topSearchEnabled: boolean;
  topSearchCents: number;
  firstListingFree: boolean;
};

export const DEFAULT_GARAGE_SALE_PRICING_SETTINGS: GarageSalePricingSettings = {
  standardPriceCents: GARAGE_SALE_FLAT_DAILY_PRICE_CENTS,
  featuredPriceCents: GARAGE_SALE_FLAT_DAILY_PRICE_CENTS,
  homepagePromoEnabled: false,
  homepagePromoCents: 0,
  topSearchEnabled: false,
  topSearchCents: 0,
  firstListingFree: false,
};

export type GarageSalePricingInput = {
  listingType: GarageSaleListingType;
  startDate: Date;
  endDate: Date;
  homepagePromotion: boolean;
  topLocalSearchPlacement: boolean;
  settings: GarageSalePricingSettings;
  isEligibleForFreeFirstListing?: boolean;
};

export type GarageSalePricingBreakdown = {
  durationDays: number;
  pricePerDayCents: number;
  baseAmountCents: number;
  addOnsAmountCents: number;
  homepagePromotionCents: number;
  topLocalSearchPlacementCents: number;
  discountCents: number;
  totalCents: number;
  effectiveHomepagePromotion: boolean;
  effectiveTopLocalSearchPlacement: boolean;
};

export function calculateGarageSaleDurationDays(startDate: Date, endDate: Date) {
  const start = startDate.getTime();
  const end = endDate.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return Math.max(1, Math.ceil((end - start) / MILLISECONDS_PER_DAY));
}

export function calculateGarageSalePricing(input: GarageSalePricingInput): GarageSalePricingBreakdown {
  const durationDays = calculateGarageSaleDurationDays(input.startDate, input.endDate);
  const pricePerDayCents = GARAGE_SALE_FLAT_DAILY_PRICE_CENTS;

  const baseAmountCents = durationDays * pricePerDayCents;
  const effectiveHomepagePromotion = false;
  const effectiveTopLocalSearchPlacement = false;
  const homepagePromotionCents = 0;
  const topLocalSearchPlacementCents = 0;
  const addOnsAmountCents = 0;
  const subtotal = baseAmountCents;
  const discountCents = 0;

  return {
    durationDays,
    pricePerDayCents,
    baseAmountCents,
    addOnsAmountCents,
    homepagePromotionCents,
    topLocalSearchPlacementCents,
    discountCents,
    totalCents: Math.max(0, subtotal - discountCents),
    effectiveHomepagePromotion,
    effectiveTopLocalSearchPlacement,
  };
}

export function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}
