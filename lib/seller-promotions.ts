import type {
  SalesPromotion,
  SalesPromotionKind,
  SalesPromotionStatus,
  SellerDiscountType,
  SellerPromotionRewardType,
  SellerPromotionTriggerType,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { DEFAULT_DATE_FORMAT_OPTIONS } from '@/lib/date-format';
import { dollars } from '@/lib/money';

export type PromotionRouteKind = 'discounts' | 'offers';

export const PROMOTION_ROUTE_KIND_TO_DB_KIND: Record<PromotionRouteKind, SalesPromotionKind> = {
  discounts: 'DISCOUNT',
  offers: 'OFFER',
};

export const SALES_PROMOTION_KIND_LABELS: Record<SalesPromotionKind, string> = {
  DISCOUNT: 'Discount',
  OFFER: 'Offer',
};

const DISCOUNT_TYPE_LABELS: Record<SellerDiscountType, string> = {
  PERCENTAGE: 'Percentage',
  FIXED_AMOUNT: 'Fixed amount',
};

const TRIGGER_TYPE_LABELS: Record<SellerPromotionTriggerType, string> = {
  ANY_PURCHASE: 'Any purchase',
  MIN_SPEND: 'Minimum spend',
  MIN_QUANTITY: 'Minimum quantity',
};

const REWARD_TYPE_LABELS: Record<SellerPromotionRewardType, string> = {
  FREE_ITEM: 'Free item',
};

export function isPromotionRouteKind(value: string): value is PromotionRouteKind {
  return value === 'discounts' || value === 'offers';
}

export function getPromotionRouteLabel(kind: PromotionRouteKind) {
  return kind === 'discounts' ? 'Discounts' : 'Offers';
}

export function formatSalesPromotionStatus(status: SalesPromotionStatus) {
  return status
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function salesPromotionStatusTone(status: SalesPromotionStatus) {
  if (status === 'ACTIVE') return 'badge-green';
  if (status === 'SCHEDULED') return 'badge-blue';
  if (status === 'DRAFT') return 'badge-yellow';
  if (status === 'ARCHIVED') return 'badge-red';
  return 'badge-slate';
}

export function formatDiscountValue(discountType?: SellerDiscountType | null, discountValue?: number | null) {
  if (!discountType || discountValue == null) return '—';
  if (discountType === 'PERCENTAGE') return `${discountValue}%`;
  return dollars(discountValue);
}

export function describeTrigger(triggerType?: SellerPromotionTriggerType | null, triggerValue?: number | null) {
  if (!triggerType) return '—';
  if (triggerType === 'ANY_PURCHASE') return 'Any qualifying purchase';
  if (triggerType === 'MIN_SPEND') return `Spend at least ${dollars(triggerValue ?? 0)}`;
  return `Buy at least ${triggerValue ?? 0} item${triggerValue === 1 ? '' : 's'}`;
}

export function describeReward(
  rewardType?: SellerPromotionRewardType | null,
  rewardProductName?: string | null,
  rewardQuantity?: number | null,
) {
  if (!rewardType) return '—';
  if (rewardType === 'FREE_ITEM') {
    const quantity = rewardQuantity ?? 1;
    return `Free ${quantity > 1 ? `${quantity} × ` : ''}${rewardProductName ?? 'item'}`;
  }
  return rewardType;
}

export function formatSalesPromotionDate(date?: Date | null) {
  return date ? date.toLocaleDateString('en-US', DEFAULT_DATE_FORMAT_OPTIONS) : '—';
}

export function formatDateTimeLocalValue(date?: Date | null) {
  if (!date) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function deriveSalesPromotionStatus({
  requestedStatus,
  startsAt,
  endsAt,
  now = new Date(),
}: {
  requestedStatus: SalesPromotionStatus;
  startsAt?: Date | null;
  endsAt?: Date | null;
  now?: Date;
}): SalesPromotionStatus {
  if (requestedStatus === 'ARCHIVED' || requestedStatus === 'DRAFT') return requestedStatus;
  if (endsAt && endsAt <= now) return 'EXPIRED';
  if (startsAt && startsAt > now) return 'SCHEDULED';
  return 'ACTIVE';
}

export async function syncSalesPromotionStatuses(sellerId?: string) {
  const now = new Date();
  const where = sellerId ? { sellerId } : {};

  const [expired, scheduled, active] = await prisma.$transaction([
    prisma.salesPromotion.updateMany({
      where: {
        ...where,
        status: { in: ['ACTIVE', 'SCHEDULED'] },
        endsAt: { lte: now },
      },
      data: { status: 'EXPIRED' },
    }),
    prisma.salesPromotion.updateMany({
      where: {
        ...where,
        status: { in: ['ACTIVE', 'EXPIRED'] },
        startsAt: { gt: now },
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      data: { status: 'SCHEDULED' },
    }),
    prisma.salesPromotion.updateMany({
      where: {
        ...where,
        status: { in: ['SCHEDULED', 'EXPIRED'] },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      data: { status: 'ACTIVE' },
    }),
  ]);

  return {
    expired: expired.count,
    scheduled: scheduled.count,
    active: active.count,
  };
}

export function toDbPromotionKind(kind: PromotionRouteKind): SalesPromotionKind {
  return PROMOTION_ROUTE_KIND_TO_DB_KIND[kind];
}

export function getPromotionOverviewHref(kind: PromotionRouteKind) {
  return `/seller/promotions/${kind}`;
}

export function getPromotionDetailHref(kind: PromotionRouteKind, id: string) {
  return `/seller/promotions/${kind}/${id}`;
}

export type SellerPromotionWithReward = SalesPromotion & {
  rewardProduct: { id: string; title: string } | null;
};

export function summarizeSalesPromotion(promotion: SellerPromotionWithReward) {
  if (promotion.kind === 'DISCOUNT') {
    return formatDiscountValue(promotion.discountType, promotion.discountValue);
  }

  return `${describeTrigger(promotion.triggerType, promotion.triggerValue)} → ${describeReward(
    promotion.rewardType,
    promotion.rewardProduct?.title,
    promotion.rewardQuantity,
  )}`;
}

export function getPromotionFieldDescription(kind: PromotionRouteKind) {
  return kind === 'discounts'
    ? 'Create targeted percentage or fixed-amount discounts with scheduling, limits, and listing-level applicability.'
    : 'Create free gift and buy-more offers with clear trigger conditions, reward rules, and scheduling.';
}

export async function getSellerPromotionProductOptions(sellerId: string) {
  return prisma.product.findMany({
    where: { sellerId },
    select: {
      id: true,
      title: true,
      priceCents: true,
      status: true,
      inventory: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listSellerPromotions(sellerId: string, kind: PromotionRouteKind) {
  return prisma.salesPromotion.findMany({
    where: {
      sellerId,
      kind: toDbPromotionKind(kind),
    },
    include: {
      rewardProduct: {
        select: { id: true, title: true },
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });
}
