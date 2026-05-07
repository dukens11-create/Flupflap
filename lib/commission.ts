import { prisma } from '@/lib/db';

const FIXED_COMMISSION_PERCENT = 6;
const MARKETPLACE_SETTINGS_ID = 1;

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
  return item.lineSubtotalCents || (item.priceCents * item.quantity);
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
      },
    });
  }

  if (existing.defaultSellerCommissionBps !== DEFAULT_BOOTSTRAP_COMMISSION_BPS) {
    return prisma.marketplaceSettings.update({
      where: { id: MARKETPLACE_SETTINGS_ID },
      data: {
        defaultSellerCommissionBps: DEFAULT_BOOTSTRAP_COMMISSION_BPS,
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
) {
  const pickupSet = new Set(pickupItemIds);

  const commissionItems = products.map((product) => {
    const quantity = items.find((item) => item.productId === product.id)?.quantity ?? 1;
    const lineSubtotalCents = product.priceCents * quantity;
    // Product.shippingCents is stored as the per-unit shipping amount.
    const shippingCents = pickupSet.has(product.id) ? 0 : product.shippingCents;
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
