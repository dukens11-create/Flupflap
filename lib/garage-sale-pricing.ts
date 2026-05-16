export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

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
  standardPriceCents: 299,
  featuredPriceCents: 699,
  homepagePromoEnabled: true,
  homepagePromoCents: 499,
  topSearchEnabled: true,
  topSearchCents: 399,
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
  const pricePerDayCents = input.listingType === 'FEATURED'
    ? input.settings.featuredPriceCents
    : input.settings.standardPriceCents;

  const baseAmountCents = durationDays * pricePerDayCents;

  const effectiveHomepagePromotion = input.homepagePromotion && input.settings.homepagePromoEnabled;
  const effectiveTopLocalSearchPlacement = input.topLocalSearchPlacement && input.settings.topSearchEnabled;

  const homepagePromotionCents = effectiveHomepagePromotion ? input.settings.homepagePromoCents : 0;
  const topLocalSearchPlacementCents = effectiveTopLocalSearchPlacement ? input.settings.topSearchCents : 0;

  const addOnsAmountCents = homepagePromotionCents + topLocalSearchPlacementCents;
  const subtotal = baseAmountCents + addOnsAmountCents;

  const discountCents = input.settings.firstListingFree && input.isEligibleForFreeFirstListing
    ? subtotal
    : 0;

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
