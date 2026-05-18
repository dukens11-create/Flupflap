import { NotificationType, type RefundRequestStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import { createNotifications } from '@/lib/notifications';
import { normalizeRefundAmountCents } from '@/lib/refunds';
import { stripe } from '@/lib/stripe';
import { isSchemaNotInitializedError } from '@/lib/db-errors';
import { ADMIN_REFUNDS_LOAD_ERROR, ADMIN_REFUNDS_SCHEMA_INIT_ERROR } from '@/lib/admin-refunds-errors';

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
    const refundRequest = await getRefundRequestForAction(input.refundId);

    if (!refundRequest) {
      return { ok: false, status: 404, error: 'Refund request not found.' };
    }

    if (['DENIED', 'REFUNDED'].includes(refundRequest.status)) {
      return { ok: false, status: 400, error: 'This refund request is already resolved.' };
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

    const stripeRefund = await stripe.refunds.create({
      payment_intent: refundRequest.order.stripePaymentIntentId,
      amount: approvedAmountCents,
      metadata: {
        orderId: refundRequest.orderId,
        refundRequestId: refundRequest.id,
        approvedBy: input.adminUserId,
      },
    });

    const resolvedAt = new Date();
    const nextOrderStatus = approvedAmountCents < refundRequest.order.totalCents ? 'PARTIALLY_REFUNDED' : 'REFUNDED';

    const updated = await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: refundRequest.orderId },
        data: { status: nextOrderStatus },
      });

      return tx.refundRequest.update({
        where: { id: refundRequest.id },
        data: {
          status: 'REFUNDED',
          approvedAmountCents,
          adminNotes,
          stripeRefundId: stripeRefund.id,
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
    });

    await createNotifications([
      {
        userId: refundRequest.buyerId,
        type: NotificationType.ORDER_UPDATE,
        title: 'Refund request approved',
        body: `A refund of ${amountLabel} has been issued to your original payment method.`,
        link: `/orders/${refundRequest.orderId}`,
        data: {
          orderId: refundRequest.orderId,
          refundRequestId: refundRequest.id,
          status: 'REFUNDED',
          stripeRefundId: stripeRefund.id,
        },
      },
    ]);

    return { ok: true, refund: toAdminRefundRecord(updated) };
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
    const refundRequest = await getRefundRequestForAction(input.refundId);

    if (!refundRequest) {
      return { ok: false, status: 404, error: 'Refund request not found.' };
    }

    if (['DENIED', 'REFUNDED'].includes(refundRequest.status)) {
      return { ok: false, status: 400, error: 'This refund request is already resolved.' };
    }

    const approvedAmountCents = normalizeRefundAmountCents(
      input.approvedAmountCents ?? refundRequest.requestedAmountCents,
      refundRequest.order.totalCents,
    );
    const resolvedAt = new Date();
    const nextOrderStatus = approvedAmountCents < refundRequest.order.totalCents ? 'PARTIALLY_REFUNDED' : 'REFUNDED';

    const updated = await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: refundRequest.orderId },
        data: { status: nextOrderStatus },
      });

      return tx.refundRequest.update({
        where: { id: refundRequest.id },
        data: {
          status: 'REFUNDED',
          approvedAmountCents,
          adminNotes: input.adminNote?.trim() || null,
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
    });

    await createNotifications([
      {
        userId: refundRequest.buyerId,
        type: NotificationType.ORDER_UPDATE,
        title: 'Refund request resolved',
        body: 'Your refund request was resolved by support.',
        link: `/orders/${refundRequest.orderId}`,
        data: { orderId: refundRequest.orderId, refundRequestId: refundRequest.id, status: 'REFUNDED' },
      },
    ]);

    return { ok: true, refund: toAdminRefundRecord(updated) };
  } catch (error) {
    console.error(`[admin/refunds] Failed to resolve refund ${input.refundId}.`, error);
    return { ok: false, status: 500, error: 'Unable to mark this refund as resolved right now.' };
  }
}
