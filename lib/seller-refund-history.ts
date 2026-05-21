import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

type RecordSellerRefundHistoryInput = {
  sellerId: string;
  orderId?: string | null;
  saleId?: string | null;
  refundType: string;
  sourceLabel?: string | null;
  sourceKey?: string | null;
  stripePaymentIntentId?: string | null;
  stripeRefundId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  status: string;
  reason?: string | null;
  refundedAt?: Date | null;
  resolvedAt?: Date | null;
};

type SellerRefundHistoryDbClient = PrismaClient | Prisma.TransactionClient;

function normalizeSourceKey(input: RecordSellerRefundHistoryInput): string {
  const explicitSourceKey = input.sourceKey?.trim();
  if (explicitSourceKey) return explicitSourceKey;
  if (input.stripeRefundId) return `stripe_refund:${input.stripeRefundId}`;

  const scope = input.orderId
    ? `order:${input.orderId}`
    : input.saleId
      ? `sale:${input.saleId}`
      : `seller:${input.sellerId}`;
  const paymentIntentKey = input.stripePaymentIntentId ?? 'no_payment_intent';
  const amountKey = Number.isFinite(input.amountCents) ? String(input.amountCents) : 'unknown_amount';
  const reasonKey = input.reason?.trim().toLowerCase().replace(/\s+/g, '_') ?? 'no_reason';
  const timeKey = input.refundedAt?.toISOString() ?? input.resolvedAt?.toISOString() ?? 'no_time';
  return `${input.refundType}:${scope}:${paymentIntentKey}:${amountKey}:${reasonKey}:${timeKey}`;
}

export async function recordSellerRefundHistory(
  input: RecordSellerRefundHistoryInput,
  db: SellerRefundHistoryDbClient = prisma,
) {
  const sourceKey = normalizeSourceKey(input);
  const upsertData = {
    stripeRefundId: input.stripeRefundId ?? undefined,
    amountCents: input.amountCents ?? undefined,
    currency: input.currency?.toUpperCase() ?? undefined,
    status: input.status,
    reason: input.reason ?? undefined,
    refundedAt: input.refundedAt ?? undefined,
    resolvedAt: input.resolvedAt ?? undefined,
  };

  if (input.stripeRefundId) {
    const existingByStripeRefundId = await db.sellerRefundHistory.findUnique({
      where: { stripeRefundId: input.stripeRefundId },
      select: { id: true },
    });
    if (existingByStripeRefundId) {
      return db.sellerRefundHistory.update({
        where: { id: existingByStripeRefundId.id },
        data: upsertData,
      });
    }
  }

  return db.sellerRefundHistory.upsert({
    where: { sourceKey },
    create: {
      sellerId: input.sellerId,
      orderId: input.orderId ?? null,
      saleId: input.saleId ?? null,
      refundType: input.refundType,
      sourceLabel: input.sourceLabel ?? null,
      sourceKey,
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
      stripeRefundId: input.stripeRefundId ?? null,
      amountCents: input.amountCents ?? null,
      currency: input.currency?.toUpperCase() ?? null,
      status: input.status,
      reason: input.reason ?? null,
      refundedAt: input.refundedAt ?? null,
      resolvedAt: input.resolvedAt ?? null,
    },
    update: upsertData,
  });
}
