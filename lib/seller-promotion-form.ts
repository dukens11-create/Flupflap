import type { SalesPromotionStatus, SellerDiscountType, SellerPromotionRewardType, SellerPromotionTriggerType } from '@prisma/client';
import { z } from 'zod';
import { deriveSalesPromotionStatus, type PromotionRouteKind } from '@/lib/seller-promotions';

const statusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
const discountTypeSchema = z.enum(['PERCENTAGE', 'FIXED_AMOUNT']);
const triggerTypeSchema = z.enum(['ANY_PURCHASE', 'MIN_SPEND', 'MIN_QUANTITY']);
const rewardTypeSchema = z.enum(['FREE_ITEM']);

function optionalTrimmedString(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalPositiveInt(value: FormDataEntryValue | null) {
  const normalized = optionalTrimmedString(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) return Number.NaN;
  return parsed;
}

function optionalPositiveNumber(value: FormDataEntryValue | null) {
  const normalized = optionalTrimmedString(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return Number.NaN;
  return parsed;
}

function parseDiscountValue(discountType: 'PERCENTAGE' | 'FIXED_AMOUNT', value: FormDataEntryValue | null) {
  const rawDiscountValue = discountType === 'PERCENTAGE'
    ? optionalPositiveInt(value)
    : optionalPositiveNumber(value);

  if (!rawDiscountValue || Number.isNaN(rawDiscountValue)) {
    return { value: null, error: discountType === 'PERCENTAGE'
      ? 'Percentage discounts must be whole numbers greater than zero.'
      : 'Fixed amount discounts must be valid dollar amounts greater than zero.' };
  }

  if (discountType === 'PERCENTAGE' && rawDiscountValue > 100) {
    return { value: null, error: 'Percentage discounts cannot exceed 100%.' };
  }

  return {
    value: discountType === 'PERCENTAGE' ? rawDiscountValue : Math.round(rawDiscountValue * 100),
    error: null,
  };
}

function optionalDate(value: FormDataEntryValue | null) {
  const normalized = optionalTrimmedString(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return 'INVALID';
  return parsed;
}

export type ParsedSalesPromotionForm = {
  name: string;
  description: string | null;
  status: SalesPromotionStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  applicableProductIds: string[];
  totalUsageLimit: number | null;
  perCustomerLimit: number | null;
  discountType: SellerDiscountType | null;
  discountValue: number | null;
  triggerType: SellerPromotionTriggerType | null;
  triggerValue: number | null;
  rewardType: SellerPromotionRewardType | null;
  rewardProductId: string | null;
  rewardQuantity: number | null;
};

export function parseSalesPromotionForm(form: FormData, kind: PromotionRouteKind): { data?: ParsedSalesPromotionForm; error?: string } {
  const name = optionalTrimmedString(form.get('name'));
  if (!name || name.length < 3) {
    return { error: 'Name must be at least 3 characters long.' };
  }

  const requestedStatus = statusSchema.safeParse(form.get('status')).success
    ? statusSchema.parse(form.get('status'))
    : 'DRAFT';

  const startsAt = optionalDate(form.get('startsAt'));
  const endsAt = optionalDate(form.get('endsAt'));
  if (startsAt === 'INVALID' || endsAt === 'INVALID') {
    return { error: 'Please provide valid start and end dates.' };
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    return { error: 'End date must be after the start date.' };
  }

  const totalUsageLimit = optionalPositiveInt(form.get('totalUsageLimit'));
  const perCustomerLimit = optionalPositiveInt(form.get('perCustomerLimit'));
  if (Number.isNaN(totalUsageLimit) || Number.isNaN(perCustomerLimit)) {
    return { error: 'Usage limits must be whole numbers greater than zero.' };
  }

  const applicableProductIds = form.getAll('applicableProductIds').filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const description = optionalTrimmedString(form.get('description'));
  const status = deriveSalesPromotionStatus({
    requestedStatus,
    startsAt,
    endsAt,
  });

  if (kind === 'discounts') {
    const discountTypeResult = discountTypeSchema.safeParse(form.get('discountType'));
    if (!discountTypeResult.success) {
      return { error: 'Choose a valid discount type.' };
    }
    const discountValueResult = parseDiscountValue(discountTypeResult.data, form.get('discountValue'));
    if (discountValueResult.error || discountValueResult.value == null) {
      return { error: discountValueResult.error ?? 'Discount value is invalid.' };
    }
    const discountValue = discountValueResult.value;

    return {
      data: {
        name,
        description,
        status,
        startsAt,
        endsAt,
        applicableProductIds,
        totalUsageLimit,
        perCustomerLimit,
        discountType: discountTypeResult.data,
        discountValue,
        triggerType: null,
        triggerValue: null,
        rewardType: null,
        rewardProductId: null,
        rewardQuantity: null,
      },
    };
  }

  const triggerTypeResult = triggerTypeSchema.safeParse(form.get('triggerType'));
  if (!triggerTypeResult.success) {
    return { error: 'Choose a valid trigger rule.' };
  }
  const rewardTypeResult = rewardTypeSchema.safeParse(form.get('rewardType'));
  if (!rewardTypeResult.success) {
    return { error: 'Choose a valid reward type.' };
  }
  const rewardProductId = optionalTrimmedString(form.get('rewardProductId'));
  if (!rewardProductId) {
    return { error: 'Select the free item shoppers will receive.' };
  }
  const rewardQuantity = optionalPositiveInt(form.get('rewardQuantity'));
  if (!rewardQuantity || Number.isNaN(rewardQuantity)) {
    return { error: 'Reward quantity must be a whole number greater than zero.' };
  }

  const triggerValue = optionalPositiveInt(form.get('triggerValue'));
  if (triggerTypeResult.data !== 'ANY_PURCHASE' && (!triggerValue || Number.isNaN(triggerValue))) {
    return { error: 'Enter a trigger value for minimum spend or minimum quantity offers.' };
  }
  return {
    data: {
      name,
      description,
      status,
      startsAt,
      endsAt,
      applicableProductIds,
      totalUsageLimit,
      perCustomerLimit,
      discountType: null,
      discountValue: null,
      triggerType: triggerTypeResult.data,
      triggerValue: triggerTypeResult.data === 'ANY_PURCHASE' ? null : (triggerValue ?? null),
      rewardType: rewardTypeResult.data,
      rewardProductId,
      rewardQuantity,
    },
  };
}
