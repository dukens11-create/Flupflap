import { prisma } from '@/lib/db';

const FALLBACK_DEFAULT_PERCENT = 7;
const DEFAULT_MIN_PERCENT = 6;
const DEFAULT_MAX_PERCENT = 8;
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

function parseBootstrapCommissionPercent() {
  const raw = Number(process.env.PLATFORM_FEE_PERCENT ?? FALLBACK_DEFAULT_PERCENT);
  if (!Number.isFinite(raw)) return FALLBACK_DEFAULT_PERCENT;
  const clamped = Math.min(DEFAULT_MAX_PERCENT, Math.max(DEFAULT_MIN_PERCENT, raw));
  if (clamped !== raw) {
    console.warn(`[commission] PLATFORM_FEE_PERCENT=${raw} is outside the supported bootstrap range; using ${clamped}% instead.`);
  }
  return clamped;
}

export const DEFAULT_BOOTSTRAP_COMMISSION_BPS = percentToBasisPoints(parseBootstrapCommissionPercent());

export function calculateCommissionCents(amountCents: number, commissionRateBps: number) {
  return Math.round((amountCents * commissionRateBps) / 10_000);
}

export function calculateSellerNetCents(amountCents: number, commissionRateBps: number) {
  return amountCents - calculateCommissionCents(amountCents, commissionRateBps);
}

export async function getMarketplaceSettings() {
  return prisma.marketplaceSettings.upsert({
    where: { id: MARKETPLACE_SETTINGS_ID },
    update: {},
    create: {
      id: MARKETPLACE_SETTINGS_ID,
      defaultSellerCommissionBps: DEFAULT_BOOTSTRAP_COMMISSION_BPS,
    },
  });
}

export function resolveCommissionForSeller({
  seller,
  defaultSellerCommissionBps,
}: {
  seller: SellerLike;
  defaultSellerCommissionBps: number;
}) {
  if (seller.sellerPlan?.commissionRateBps != null) {
    return {
      commissionRateBps: seller.sellerPlan.commissionRateBps,
      commissionSource: 'SELLER_PLAN' as const,
      commissionPlanCode: seller.sellerPlan.code,
    };
  }

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
    const priceTotalCents = product.priceCents * quantity;
    // Product.shippingCents is stored as the per-unit shipping amount.
    const shippingCents = pickupSet.has(product.id) ? 0 : product.shippingCents;
    const resolved = resolveCommissionForSeller({
      seller: product.seller,
      defaultSellerCommissionBps,
    });
    const commissionFeeCents = calculateCommissionCents(priceTotalCents, resolved.commissionRateBps);

    return {
      productId: product.id,
      sellerId: product.sellerId,
      sellerStripeAccountId: product.seller.stripeAccountId,
      sellerStripeOnboardingComplete: product.seller.stripeOnboardingComplete,
      quantity,
      priceCents: product.priceCents,
      shippingCents,
      commissionRateBps: resolved.commissionRateBps,
      commissionFeeCents,
      sellerNetCents: calculateSellerNetCents(priceTotalCents, resolved.commissionRateBps),
      commissionSource: resolved.commissionSource,
      commissionPlanCode: resolved.commissionPlanCode,
    } satisfies CheckoutCommissionItem;
  });

  const subtotalCents = commissionItems.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
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
