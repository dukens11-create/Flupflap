import { prisma } from '@/lib/db';

const FIXED_COMMISSION_PERCENT = 7;
const MARKETPLACE_SETTINGS_ID = 1;
const DEFAULT_FREE_PROMOTION_DAYS = 60;
const DEFAULT_GARAGE_STANDARD_PRICE_CENTS = 299;
const DEFAULT_GARAGE_FEATURED_PRICE_CENTS = 699;
const DEFAULT_GARAGE_HOMEPAGE_PROMO_CENTS = 499;
const DEFAULT_GARAGE_TOP_SEARCH_CENTS = 399;

type SellerPlanLike = {
  code: string;
  commissionRateBps: number | null;
} | null | undefined;

type SellerLike = {
  id: string;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  sellerPlan?: SellerPlanLike;
};

export type CommissionSource = 'DEFAULT' | 'SELLER_PLAN';

export type ResolvedCommission = {
  commissionRateBps: number;
  commissionSource: CommissionSource;
  commissionPlanCode: string | null;
};

export type CheckoutCommissionItem = {
  productId: string;
  sellerId: string;
  sellerStripeAccountId: string | null;
  sellerStripeOnboardingComplete: boolean;
  quantity: number;
  priceCents: number;
  shippingCents: number;
  // Persist item price × quantity from checkout/payment time so later listing
  // price edits do not change historical commission reporting.
  lineSubtotalCents: number;
  commissionRateBps: number;
  commissionFeeCents: number;
  sellerNetCents: number;
  commissionSource: CommissionSource;
  commissionPlanCode: string | null;
};

function formatPercentValue(percent: number) {
  return percent % 1 === 0 ? String(percent) : percent.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function percentToBasisPoints(percent: number) {
  return Math.round(percent * 100);
}

export function basisPointsToPercent(bps: number) {
  return bps / 100;
}

export function formatCommissionPercent(bps: number) {
  return `${formatPercentValue(basisPointsToPercent(bps))}%`;
}

export const DEFAULT_BOOTSTRAP_COMMISSION_BPS = percentToBasisPoints(FIXED_COMMISSION_PERCENT);

export function calculateCommissionCents(amountCents: number, commissionRateBps: number) {
  return Math.round((amountCents * commissionRateBps) / 10_000);
}

export function calculateSellerNetCents(amountCents: number, commissionRateBps: number) {
  return amountCents - calculateCommissionCents(amountCents, commissionRateBps);
}

export function getStoredLineSubtotalCents(item: {
  lineSubtotalCents: number;
  priceCents: number;
  quantity: number;
}) {
  if (item.lineSubtotalCents === 0 && item.priceCents > 0 && item.quantity > 0) {
    return item.priceCents * item.quantity;
  }

  return item.lineSubtotalCents;
}

export async function getMarketplaceSettings() {
  const existing = await prisma.marketplaceSettings.findUnique({
    where: { id: MARKETPLACE_SETTINGS_ID },
  });

  if (!existing) {
    return prisma.marketplaceSettings.create({
      data: {
        id: MARKETPLACE_SETTINGS_ID,
        defaultSellerCommissionBps: DEFAULT_BOOTSTRAP_COMMISSION_BPS,
        freePromotionEnabled: true,
        freePromotionDurationDays: DEFAULT_FREE_PROMOTION_DAYS,
        garageStandardPriceCents: DEFAULT_GARAGE_STANDARD_PRICE_CENTS,
        garageFeaturedPriceCents: DEFAULT_GARAGE_FEATURED_PRICE_CENTS,
        garageHomepagePromoEnabled: true,
        garageHomepagePromoCents: DEFAULT_GARAGE_HOMEPAGE_PROMO_CENTS,
        garageTopSearchEnabled: true,
        garageTopSearchCents: DEFAULT_GARAGE_TOP_SEARCH_CENTS,
        garageFirstListingFree: false,
      },
    });
  }

  if (
    existing.defaultSellerCommissionBps !== DEFAULT_BOOTSTRAP_COMMISSION_BPS
    || existing.freePromotionDurationDays < 1
    || existing.garageStandardPriceCents < 0
    || existing.garageFeaturedPriceCents < 0
    || existing.garageHomepagePromoCents < 0
    || existing.garageTopSearchCents < 0
  ) {
    return prisma.marketplaceSettings.update({
      where: { id: MARKETPLACE_SETTINGS_ID },
      data: {
        defaultSellerCommissionBps: DEFAULT_BOOTSTRAP_COMMISSION_BPS,
        ...(existing.freePromotionDurationDays < 1
          ? { freePromotionDurationDays: DEFAULT_FREE_PROMOTION_DAYS }
          : {}),
        ...(existing.garageStandardPriceCents < 0
          ? { garageStandardPriceCents: DEFAULT_GARAGE_STANDARD_PRICE_CENTS }
          : {}),
        ...(existing.garageFeaturedPriceCents < 0
          ? { garageFeaturedPriceCents: DEFAULT_GARAGE_FEATURED_PRICE_CENTS }
          : {}),
        ...(existing.garageHomepagePromoCents < 0
          ? { garageHomepagePromoCents: DEFAULT_GARAGE_HOMEPAGE_PROMO_CENTS }
          : {}),
        ...(existing.garageTopSearchCents < 0
          ? { garageTopSearchCents: DEFAULT_GARAGE_TOP_SEARCH_CENTS }
          : {}),
      },
    });
  }

  return existing;
}

export function resolveCommissionForSeller({
  seller,
  defaultSellerCommissionBps,
}: {
  seller: SellerLike;
  defaultSellerCommissionBps: number;
}) {
  return {
    commissionRateBps: defaultSellerCommissionBps,
    commissionSource: 'DEFAULT' as const,
    commissionPlanCode: null,
  };
}

export function buildCheckoutCommissionItems<
  TProduct extends {
    id: string;
    priceCents: number;
    shippingCents: number;
    sellerId: string;
    seller: SellerLike;
  },
>(
  products: TProduct[],
  items: { productId: string; quantity: number }[],
  pickupItemIds: string[],
  defaultSellerCommissionBps: number,
  /** Optional override map: productId → shippingCents. Used when live rates replace product.shippingCents. */
  shippingOverrides?: Map<string, number>,
) {
  const pickupSet = new Set(pickupItemIds);

  const commissionItems = products.map((product) => {
    const quantity = items.find((item) => item.productId === product.id)?.quantity ?? 1;
    const lineSubtotalCents = product.priceCents * quantity;
    // Product.shippingCents is stored as the per-unit shipping amount.
    let shippingCents = pickupSet.has(product.id) ? 0 : product.shippingCents;
    // Apply live-rate override when present (sets shipping to 0 on the item;
    // the actual shipping cost is charged as a separate Stripe line item).
    if (shippingOverrides?.has(product.id)) {
      shippingCents = shippingOverrides.get(product.id)!;
    }
    const resolved = resolveCommissionForSeller({
      seller: product.seller,
      defaultSellerCommissionBps,
    });
    const commissionFeeCents = calculateCommissionCents(lineSubtotalCents, resolved.commissionRateBps);

    return {
      productId: product.id,
      sellerId: product.sellerId,
      sellerStripeAccountId: product.seller.stripeAccountId,
      sellerStripeOnboardingComplete: product.seller.stripeOnboardingComplete,
      quantity,
      priceCents: product.priceCents,
      shippingCents,
      lineSubtotalCents,
      commissionRateBps: resolved.commissionRateBps,
      commissionFeeCents,
      sellerNetCents: calculateSellerNetCents(lineSubtotalCents, resolved.commissionRateBps),
      commissionSource: resolved.commissionSource,
      commissionPlanCode: resolved.commissionPlanCode,
    } satisfies CheckoutCommissionItem;
  });

  const subtotalCents = commissionItems.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
  const shippingTotalCents = commissionItems.reduce((sum, item) => sum + item.shippingCents * item.quantity, 0);
  const platformFeeCents = commissionItems.reduce((sum, item) => sum + item.commissionFeeCents, 0);
  const totalCents = subtotalCents + shippingTotalCents;

  return {
    commissionItems,
    subtotalCents,
    shippingTotalCents,
    platformFeeCents,
    totalCents,
    sellerPayoutCents: totalCents - platformFeeCents,
  };
}
