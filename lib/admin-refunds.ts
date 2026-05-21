import { NotificationType, type RefundRequestStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import { createNotifications } from '@/lib/notifications';
import { isOrderRefundEligible, normalizeRefundAmountCents } from '@/lib/refunds';
import { stripe } from '@/lib/stripe';
import { isSchemaNotInitializedError } from '@/lib/db-errors';
import { ADMIN_REFUNDS_LOAD_ERROR, ADMIN_REFUNDS_SCHEMA_INIT_ERROR } from '@/lib/admin-refunds-errors';
import { recordSellerRefundHistory } from '@/lib/seller-refund-history';

export type AdminRefundRecord = {
  id: string;
  orderId: string;
  orderStatus: string;
  buyer: {
    id: string;
    name: string | null;
    email: string;
  };
  seller: {
    id: string;
    name: string | null;
    email: string;
  };
  reason: string;
  details: string | null;
  requestedAmountCents: number;
  approvedAmountCents: number | null;
  adminNotes: string | null;
  sellerResponse: string | null;
  status: RefundRequestStatus;
  stripePaymentIntentId: string | null;
  stripeRefundId: string | null;
  stripeRefundStatus: string | null;
  stripeRefundAmount: number | null;
  stripeRefundCurrency: string | null;
  stripeFailureReason: string | null;
  stripeErrorCode: string | null;
  stripeErrorMessage: string | null;
  stripeRefundCreatedAt: string | null;
  stripeRefundUpdatedAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

type RefundActionInput = {
  refundId: string;
  adminUserId: string;
  adminNote?: string | null;
  approvedAmountCents?: number;
};

type RefundActionResult =
  | { ok: true; refund: AdminRefundRecord }
  | { ok: false; status: number; error: string };

function toAdminRefundRecord(refundRequest: {
  id: string;
  orderId: string;
  reason: string;
  details: string | null;
  requestedAmountCents: number;
  approvedAmountCents: number | null;
  adminNotes: string | null;
  sellerResponse: string | null;
  status: RefundRequestStatus;
  stripeRefundId: string | null;
  stripeRefundStatus: string | null;
  stripeRefundAmount: number | null;
  stripeRefundCurrency: string | null;
  stripeFailureReason: string | null;
  stripeErrorCode: string | null;
  stripeErrorMessage: string | null;
  stripeRefundCreatedAt: Date | null;
  stripeRefundUpdatedAt: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
  buyer: { id: string; name: string | null; email: string };
  seller: { id: string; name: string | null; email: string };
  order: { id: string; status: string; stripePaymentIntentId: string | null };
}): AdminRefundRecord {
  return {
    id: refundRequest.id,
    orderId: refundRequest.orderId,
    orderStatus: refundRequest.order.status,
    buyer: refundRequest.buyer,
    seller: refundRequest.seller,
    reason: refundRequest.reason,
    details: refundRequest.details,
    requestedAmountCents: refundRequest.requestedAmountCents,
    approvedAmountCents: refundRequest.approvedAmountCents,
    adminNotes: refundRequest.adminNotes,
    sellerResponse: refundRequest.sellerResponse,
    status: refundRequest.status,
    stripePaymentIntentId: refundRequest.order.stripePaymentIntentId,
    stripeRefundId: refundRequest.stripeRefundId,
    stripeRefundStatus: refundRequest.stripeRefundStatus,
    stripeRefundAmount: refundRequest.stripeRefundAmount,
    stripeRefundCurrency: refundRequest.stripeRefundCurrency,
    stripeFailureReason: refundRequest.stripeFailureReason,
    stripeErrorCode: refundRequest.stripeErrorCode,
    stripeErrorMessage: refundRequest.stripeErrorMessage,
    stripeRefundCreatedAt: refundRequest.stripeRefundCreatedAt?.toISOString() ?? null,
    stripeRefundUpdatedAt: refundRequest.stripeRefundUpdatedAt?.toISOString() ?? null,
    createdAt: refundRequest.createdAt.toISOString(),
    resolvedAt: refundRequest.resolvedAt?.toISOString() ?? null,
  };
}

async function getRefundRequestForAction(refundId: string) {
  return prisma.refundRequest.findUnique({
    where: { id: refundId },
    include: {
      buyer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      seller: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      order: {
        select: {
          id: true,
          status: true,
          totalCents: true,
          stripePaymentIntentId: true,
        },
      },
    },
  });
}

const STRIPE_REFUND_CURRENCY = 'usd';
const STRIPE_REFUND_SUCCESS_STATUS = 'succeeded';
const STRIPE_REFUND_CURRENCY_UPPER = 'USD';

async function performStripeBackedAdminRefund(
  input: RefundActionInput,
  successTitle: string,
  successBody: string,
): Promise<RefundActionResult> {
  const refundRequest = await getRefundRequestForAction(input.refundId);

  if (!refundRequest) {
    return { ok: false, status: 404, error: 'Refund request not found.' };
  }

  if (['DENIED', 'REFUNDED'].includes(refundRequest.status)) {
    return { ok: false, status: 400, error: 'This refund request is already resolved.' };
  }

  if (!isOrderRefundEligible(refundRequest.order.status)) {
    return { ok: false, status: 400, error: 'This order is not in a refundable state.' };
  }

  if (!refundRequest.order.stripePaymentIntentId) {
    return { ok: false, status: 400, error: 'No Stripe payment intent found for this refund.' };
  }

  const approvedAmountCents = normalizeRefundAmountCents(
    input.approvedAmountCents ?? refundRequest.requestedAmountCents,
    refundRequest.order.totalCents,
  );
  const adminNotes = input.adminNote?.trim() || null;
  const amountLabel = dollars(approvedAmountCents);
  const idempotencyKey = `admin_refund_${refundRequest.id}_${approvedAmountCents}`;

  let stripeRefund;
  try {
    stripeRefund = await stripe.refunds.create(
      {
        payment_intent: refundRequest.order.stripePaymentIntentId,
        amount: approvedAmountCents,
        metadata: {
          orderId: refundRequest.orderId,
          refundRequestId: refundRequest.id,
          approvedBy: input.adminUserId,
        },
      },
      { idempotencyKey },
    );
  } catch (error) {
    const stripeErrorCode = typeof (error as { code?: unknown })?.code === 'string'
      ? (error as { code: string }).code
      : null;
    const stripeErrorMessage = typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message
      : 'Stripe refund request failed.';

    try {
      await prisma.refundRequest.update({
        where: { id: refundRequest.id },
        data: {
          stripeRefundStatus: 'failed',
          stripeFailureReason: 'api_error',
          stripeErrorCode,
          stripeErrorMessage,
          stripeRefundUpdatedAt: new Date(),
        },
      });
    } catch (persistError) {
      console.error('[admin/refunds] Failed to persist Stripe refund failure metadata.', persistError);
    }

    console.error('[admin/refunds] Stripe refund request failed.', {
      refundId: refundRequest.id,
      orderId: refundRequest.orderId,
      idempotencyKey,
      stripeErrorCode,
      stripeErrorMessage,
      error,
    });
    return {
      ok: false,
      status: 502,
      error: 'Stripe refund failed. The refund was not completed. Please retry or contact support for details.',
    };
  }

  const stripeRefundStatus = stripeRefund.status ?? null;
  const stripeFailureReason = stripeRefund.failure_reason ?? null;
  const stripeRefundAmount = Number.isFinite(stripeRefund.amount) ? stripeRefund.amount : null;
  const stripeRefundCurrency = typeof stripeRefund.currency === 'string' ? stripeRefund.currency.toUpperCase() : null;
  const stripeRefundCreatedAt = Number.isFinite(stripeRefund.created) ? new Date(stripeRefund.created * 1000) : null;
  const stripeRefundUpdatedAt = new Date();

  if (
    stripeRefundStatus !== STRIPE_REFUND_SUCCESS_STATUS
    || stripeRefundAmount !== approvedAmountCents
    || stripeRefundCurrency !== STRIPE_REFUND_CURRENCY_UPPER
  ) {
    const mismatchReason = stripeRefundStatus !== STRIPE_REFUND_SUCCESS_STATUS
      ? `Stripe refund ${stripeRefund.id} status is ${stripeRefundStatus ?? 'unknown'}.`
      : stripeRefundAmount !== approvedAmountCents
        ? `Stripe refund ${stripeRefund.id} amount mismatch. Expected ${approvedAmountCents}, got ${stripeRefundAmount ?? 'unknown'}.`
        : `Stripe refund ${stripeRefund.id} currency mismatch. Expected ${STRIPE_REFUND_CURRENCY_UPPER}, got ${stripeRefundCurrency ?? 'unknown'}.`;

    await prisma.refundRequest.update({
      where: { id: refundRequest.id },
      data: {
        stripeRefundId: stripeRefund.id,
        stripeRefundStatus,
        stripeRefundAmount,
        stripeRefundCurrency,
        stripeFailureReason,
        stripeErrorCode: null,
        stripeErrorMessage: `${mismatchReason} Verify the Stripe dashboard before retrying.`,
        stripeRefundCreatedAt,
        stripeRefundUpdatedAt,
      },
    });

    return {
      ok: false,
      status: 409,
      error: `${mismatchReason} Refund request remains open. Verify Stripe details and retry.`,
    };
  }

  const resolvedAt = new Date();
  const nextOrderStatus = approvedAmountCents < refundRequest.order.totalCents ? 'PARTIALLY_REFUNDED' : 'REFUNDED';

  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: refundRequest.orderId },
      data: { status: nextOrderStatus },
    });

    const updatedRefundRequest = await tx.refundRequest.update({
      where: { id: refundRequest.id },
      data: {
        status: 'REFUNDED',
        approvedAmountCents,
        adminNotes,
        stripeRefundId: stripeRefund.id,
        stripeRefundStatus,
        stripeRefundAmount,
        stripeRefundCurrency,
        stripeFailureReason,
        stripeErrorCode: null,
        stripeErrorMessage: null,
        stripeRefundCreatedAt,
        stripeRefundUpdatedAt,
        resolvedAt,
      },
      include: {
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        order: {
          select: {
            id: true,
            status: true,
            stripePaymentIntentId: true,
          },
        },
      },
    });

    await recordSellerRefundHistory({
      sellerId: refundRequest.sellerId,
      orderId: refundRequest.orderId,
      refundType: 'admin_order_refund',
      sourceLabel: 'Admin order refund',
      sourceKey: `admin_order_refund:${refundRequest.id}:${stripeRefund.id}`,
      stripePaymentIntentId: refundRequest.order.stripePaymentIntentId,
      stripeRefundId: stripeRefund.id,
      amountCents: stripeRefundAmount ?? approvedAmountCents,
      currency: stripeRefundCurrency ?? STRIPE_REFUND_CURRENCY_UPPER,
      status: stripeRefundStatus ?? STRIPE_REFUND_SUCCESS_STATUS,
      reason: refundRequest.reason,
      refundedAt: stripeRefundCreatedAt ?? resolvedAt,
      resolvedAt,
    }, tx);

    return updatedRefundRequest;
  });

  await createNotifications([
    {
      userId: refundRequest.buyerId,
      type: NotificationType.ORDER_UPDATE,
      title: successTitle,
      body: successBody.replace('{amount}', amountLabel),
      link: `/orders/${refundRequest.orderId}`,
      data: {
        orderId: refundRequest.orderId,
        refundRequestId: refundRequest.id,
        status: 'REFUNDED',
        stripeRefundId: stripeRefund.id,
        stripeRefundStatus,
      },
    },
  ]);

  return { ok: true, refund: toAdminRefundRecord(updated) };
}

export async function getAdminRefundRequests(): Promise<{
  refundRequests: AdminRefundRecord[];
  fetchFailed: boolean;
  fetchError?: string;
  schemaNotInitialized?: boolean;
}> {
  try {
    const refundRequests = await prisma.refundRequest.findMany({
      include: {
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        order: {
          select: {
            id: true,
            status: true,
            stripePaymentIntentId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      refundRequests: refundRequests.map(toAdminRefundRecord),
      fetchFailed: false,
    };
  } catch (error) {
    console.error('[admin/refunds] Failed to fetch refund requests.', error);
    const schemaNotInitialized = isSchemaNotInitializedError(error);
    return {
      refundRequests: [],
      fetchFailed: true,
      schemaNotInitialized,
      fetchError: schemaNotInitialized
        ? ADMIN_REFUNDS_SCHEMA_INIT_ERROR
        : ADMIN_REFUNDS_LOAD_ERROR,
    };
  }
}

export async function approveAdminRefund(input: RefundActionInput): Promise<RefundActionResult> {
  try {
    return performStripeBackedAdminRefund(
      input,
      'Refund request approved',
      'A refund of {amount} has been issued to your original payment method.',
    );
  } catch (error) {
    console.error(`[admin/refunds] Failed to approve refund ${input.refundId}.`, error);
    return { ok: false, status: 500, error: 'Unable to approve this refund right now.' };
  }
}

export async function rejectAdminRefund(input: RefundActionInput): Promise<RefundActionResult> {
  try {
    const refundRequest = await getRefundRequestForAction(input.refundId);

    if (!refundRequest) {
      return { ok: false, status: 404, error: 'Refund request not found.' };
    }

    if (['DENIED', 'REFUNDED'].includes(refundRequest.status)) {
      return { ok: false, status: 400, error: 'This refund request is already resolved.' };
    }

    const updated = await prisma.refundRequest.update({
      where: { id: refundRequest.id },
      data: {
        status: 'DENIED',
        adminNotes: input.adminNote?.trim() || null,
        resolvedAt: new Date(),
      },
      include: {
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        order: {
          select: {
            id: true,
            status: true,
            stripePaymentIntentId: true,
          },
        },
      },
    });

    await createNotifications([
      {
        userId: refundRequest.buyerId,
        type: NotificationType.ORDER_UPDATE,
        title: 'Refund request denied',
        body: 'Your refund request was reviewed and denied. Please check your order page for more details or contact support.',
        link: `/orders/${refundRequest.orderId}`,
        data: { orderId: refundRequest.orderId, refundRequestId: refundRequest.id, status: 'DENIED' },
      },
    ]);

    return { ok: true, refund: toAdminRefundRecord(updated) };
  } catch (error) {
    console.error(`[admin/refunds] Failed to reject refund ${input.refundId}.`, error);
    return { ok: false, status: 500, error: 'Unable to reject this refund right now.' };
  }
}

export async function resolveAdminRefund(input: RefundActionInput): Promise<RefundActionResult> {
  try {
    return performStripeBackedAdminRefund(
      input,
      'Refund request resolved',
      'Your refund request was resolved by support. Refunded amount: {amount}.',
    );
  } catch (error) {
    console.error(`[admin/refunds] Failed to resolve refund ${input.refundId}.`, error);
    return { ok: false, status: 500, error: 'Unable to mark this refund as resolved right now.' };
  }
}
