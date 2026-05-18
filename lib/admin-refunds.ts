import type { Prisma } from '@prisma/client';
import { NotificationType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { isSchemaNotInitializedError } from '@/lib/db-errors';
import { createNotifications } from '@/lib/notifications';
import { normalizeRefundAmountCents } from '@/lib/refunds';
import { stripe } from '@/lib/stripe';

export type AdminRefundListItem = {
  id: string;
  orderId: string;
  status: 'REQUESTED' | 'SELLER_REVIEW' | 'APPROVED' | 'DENIED' | 'REFUNDED';
  reason: string;
  details: string | null;
  requestedAmountCents: number;
  approvedAmountCents: number | null;
  adminNotes: string | null;
  sellerResponse: string | null;
  stripeRefundId: string | null;
  stripePaymentIntentId: string | null;
  createdAt: string;
  resolvedAt: string | null;
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
  order: {
    id: string;
    status: string;
    totalCents: number;
  };
};

export class AdminRefundActionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AdminRefundActionError';
    this.status = status;
  }
}

type AdminRefundRequestWithRelations = Prisma.RefundRequestGetPayload<{
  include: {
    buyer: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
    seller: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
    order: {
      select: {
        id: true;
        status: true;
        totalCents: true;
        stripePaymentIntentId: true;
      };
    };
  };
}>;

function serializeRefundRequest(request: AdminRefundRequestWithRelations): AdminRefundListItem {
  return {
    id: request.id,
    orderId: request.orderId,
    status: request.status,
    reason: request.reason,
    details: request.details,
    requestedAmountCents: request.requestedAmountCents,
    approvedAmountCents: request.approvedAmountCents,
    adminNotes: request.adminNotes,
    sellerResponse: request.sellerResponse,
    stripeRefundId: request.stripeRefundId,
    stripePaymentIntentId: request.order.stripePaymentIntentId,
    createdAt: request.createdAt.toISOString(),
    resolvedAt: request.resolvedAt ? request.resolvedAt.toISOString() : null,
    buyer: request.buyer,
    seller: request.seller,
    order: {
      id: request.order.id,
      status: request.order.status,
      totalCents: request.order.totalCents,
    },
  };
}

export async function getAdminRefundRequestsSafe(): Promise<{
  refundRequests: AdminRefundListItem[];
  fetchError: boolean;
  schemaIssue: boolean;
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
            totalCents: true,
            stripePaymentIntentId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      refundRequests: refundRequests.map(serializeRefundRequest),
      fetchError: false,
      schemaIssue: false,
    };
  } catch (error) {
    console.error('Failed to load admin refund requests:', error);

    return {
      refundRequests: [],
      fetchError: true,
      schemaIssue: isSchemaNotInitializedError(error),
    };
  }
}

async function getRefundRequestForAdminAction(id: string) {
  const refundRequest = await prisma.refundRequest.findUnique({
    where: { id },
    include: {
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

  if (!refundRequest) {
    throw new AdminRefundActionError(404, 'Refund request not found.');
  }

  return refundRequest;
}

function ensureRefundRequestIsOpen(status: string) {
  if (['DENIED', 'REFUNDED'].includes(status)) {
    throw new AdminRefundActionError(400, 'This refund request is already resolved.');
  }
}

export async function approveRefundRequest({
  id,
  adminId,
  approvedAmountCents,
  adminNote,
}: {
  id: string;
  adminId: string;
  approvedAmountCents?: number;
  adminNote?: string;
}) {
  const refundRequest = await getRefundRequestForAdminAction(id);
  ensureRefundRequestIsOpen(refundRequest.status);

  if (!refundRequest.order.stripePaymentIntentId) {
    throw new AdminRefundActionError(400, 'No Stripe payment intent found for this refund request.');
  }

  const normalizedAmountCents = normalizeRefundAmountCents(
    approvedAmountCents ?? refundRequest.requestedAmountCents,
    refundRequest.order.totalCents,
  );
  const normalizedAdminNote = adminNote?.trim() || null;

  const stripeRefund = await stripe.refunds.create({
    payment_intent: refundRequest.order.stripePaymentIntentId,
    amount: normalizedAmountCents,
    metadata: {
      orderId: refundRequest.orderId,
      refundRequestId: refundRequest.id,
      approvedBy: adminId,
    },
  });

  const resolvedAt = new Date();
  const nextOrderStatus = normalizedAmountCents < refundRequest.order.totalCents ? 'PARTIALLY_REFUNDED' : 'REFUNDED';

  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: refundRequest.orderId },
      data: { status: nextOrderStatus },
    });

    return tx.refundRequest.update({
      where: { id: refundRequest.id },
      data: {
        status: 'REFUNDED',
        approvedAmountCents: normalizedAmountCents,
        adminNotes: normalizedAdminNote,
        stripeRefundId: stripeRefund.id,
        resolvedAt,
      },
    });
  });

  await createNotifications([
    {
      userId: refundRequest.buyerId,
      type: NotificationType.ORDER_UPDATE,
      title: 'Refund request approved',
      body: 'Your refund request was approved and is now being processed.',
      link: `/orders/${refundRequest.orderId}`,
      data: { orderId: refundRequest.orderId, refundRequestId: refundRequest.id, status: 'APPROVED' },
    },
    {
      userId: refundRequest.buyerId,
      type: NotificationType.ORDER_UPDATE,
      title: 'Refund completed',
      body: `A refund of $${(normalizedAmountCents / 100).toFixed(2)} was issued to your original payment method.`,
      link: `/orders/${refundRequest.orderId}`,
      data: { orderId: refundRequest.orderId, refundRequestId: refundRequest.id, status: 'REFUNDED', stripeRefundId: stripeRefund.id },
    },
  ]);

  return updated;
}

export async function rejectRefundRequest({
  id,
  adminNote,
}: {
  id: string;
  adminNote?: string;
}) {
  const refundRequest = await getRefundRequestForAdminAction(id);
  ensureRefundRequestIsOpen(refundRequest.status);
  const normalizedAdminNote = adminNote?.trim() || null;

  const denied = await prisma.refundRequest.update({
    where: { id: refundRequest.id },
    data: {
      status: 'DENIED',
      adminNotes: normalizedAdminNote,
      resolvedAt: new Date(),
    },
  });

  await createNotifications([
    {
      userId: refundRequest.buyerId,
      type: NotificationType.ORDER_UPDATE,
      title: 'Refund request denied',
      body: 'Your refund request was denied after review by support.',
      link: `/orders/${refundRequest.orderId}`,
      data: { orderId: refundRequest.orderId, refundRequestId: refundRequest.id, status: 'DENIED' },
    },
  ]);

  return denied;
}

export async function resolveRefundRequest({
  id,
  adminNote,
}: {
  id: string;
  adminNote?: string;
}) {
  const refundRequest = await getRefundRequestForAdminAction(id);

  if (refundRequest.resolvedAt) {
    return refundRequest;
  }

  if (!['APPROVED', 'DENIED', 'REFUNDED'].includes(refundRequest.status)) {
    throw new AdminRefundActionError(400, 'Only approved, denied, or refunded requests can be marked as resolved.');
  }

  const normalizedAdminNote = adminNote === undefined
    ? refundRequest.adminNotes
    : adminNote.trim() || null;

  return prisma.refundRequest.update({
    where: { id: refundRequest.id },
    data: {
      adminNotes: normalizedAdminNote,
      resolvedAt: new Date(),
    },
  });
}
