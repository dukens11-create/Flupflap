import { NotificationType, type RefundRequestStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createNotifications } from '@/lib/notifications';
import { logError } from '@/lib/logger';
import { normalizeRefundAmountCents } from '@/lib/refunds';
import { stripe } from '@/lib/stripe';

const adminRefundDashboardInclude = {
  order: {
    select: {
      id: true,
      status: true,
      totalCents: true,
      stripePaymentIntentId: true,
      buyer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      items: {
        select: {
          id: true,
          quantity: true,
          product: {
            select: {
              id: true,
              title: true,
              seller: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const adminRefundActionInclude = {
  order: {
    select: {
      id: true,
      status: true,
      totalCents: true,
      stripePaymentIntentId: true,
    },
  },
} as const;

async function findAdminRefundDashboardRows() {
  return prisma.refundRequest.findMany({
    include: adminRefundDashboardInclude,
    orderBy: { createdAt: 'desc' },
  });
}

async function findAdminRefundActionRecord(refundRequestId: string) {
  return prisma.refundRequest.findUnique({
    where: { id: refundRequestId },
    include: adminRefundActionInclude,
  });
}

type AdminRefundDashboardRecord = Awaited<ReturnType<typeof findAdminRefundDashboardRows>>[number];
type AdminRefundActionRecord = NonNullable<Awaited<ReturnType<typeof findAdminRefundActionRecord>>>;

export type AdminRefundDashboardItem = {
  id: string;
  status: RefundRequestStatus;
  reason: string;
  details: string | null;
  requestedAmountCents: number;
  approvedAmountCents: number | null;
  adminNotes: string | null;
  sellerResponse: string | null;
  stripeRefundId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  order: {
    id: string;
    status: string;
    totalCents: number;
    stripePaymentIntentId: string | null;
    buyer: { id: string; name: string | null; email: string };
    items: Array<{
      id: string;
      quantity: number;
      product: {
        id: string;
        title: string;
        seller: { id: string; name: string | null; email: string };
      };
    }>;
  };
};

export type AdminRefundMutationResult = {
  id: string;
  status: RefundRequestStatus;
  approvedAmountCents: number | null;
  adminNotes: string | null;
  stripeRefundId: string | null;
  resolvedAt: string | null;
};

export class AdminRefundActionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AdminRefundActionError';
  }
}

function serializeAdminRefundRequest(request: AdminRefundDashboardRecord): AdminRefundDashboardItem {
  return {
    ...request,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
  };
}

function serializeMutationResult(request: {
  id: string;
  status: RefundRequestStatus;
  approvedAmountCents: number | null;
  adminNotes: string | null;
  stripeRefundId: string | null;
  resolvedAt: Date | null;
}): AdminRefundMutationResult {
  return {
    id: request.id,
    status: request.status,
    approvedAmountCents: request.approvedAmountCents,
    adminNotes: request.adminNotes,
    stripeRefundId: request.stripeRefundId,
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
  };
}

async function requireRefundRequest(refundRequestId: string): Promise<AdminRefundActionRecord> {
  const refundRequest = await findAdminRefundActionRecord(refundRequestId);
  if (!refundRequest) {
    throw new AdminRefundActionError('Refund request not found.', 404);
  }
  return refundRequest;
}

function assertRefundRequestOpen(refundRequest: AdminRefundActionRecord) {
  if (refundRequest.status === 'DENIED' || refundRequest.status === 'REFUNDED') {
    throw new AdminRefundActionError('This refund request is already resolved.', 400);
  }
}

export async function getAdminRefundRequests(): Promise<AdminRefundDashboardItem[]> {
  try {
    const refundRequests = await findAdminRefundDashboardRows();
    return refundRequests.map(serializeAdminRefundRequest);
  } catch (error) {
    logError('Failed to load admin refunds dashboard data.', error, {
      tag: 'admin/refunds/page',
    });
    return [];
  }
}

export async function approveAdminRefundRequest({
  refundRequestId,
  adminUserId,
  approvedAmountCents,
  adminNotes,
}: {
  refundRequestId: string;
  adminUserId: string;
  approvedAmountCents?: number;
  adminNotes?: string;
}): Promise<AdminRefundMutationResult> {
  const refundRequest = await requireRefundRequest(refundRequestId);
  assertRefundRequestOpen(refundRequest);

  if (!refundRequest.order.stripePaymentIntentId) {
    throw new AdminRefundActionError('No Stripe payment intent found for this order.', 400);
  }

  const normalizedApprovedAmountCents = normalizeRefundAmountCents(
    approvedAmountCents ?? refundRequest.requestedAmountCents,
    refundRequest.order.totalCents,
  );
  const mergedNotes = adminNotes?.trim() || null;

  await prisma.refundRequest.update({
    where: { id: refundRequest.id },
    data: {
      status: 'APPROVED',
      approvedAmountCents: normalizedApprovedAmountCents,
      adminNotes: mergedNotes,
    },
  });

  const stripeRefund = await stripe.refunds.create({
    payment_intent: refundRequest.order.stripePaymentIntentId,
    amount: normalizedApprovedAmountCents,
    metadata: {
      orderId: refundRequest.orderId,
      refundRequestId: refundRequest.id,
      approvedBy: adminUserId,
    },
  });

  const resolvedAt = new Date();
  const nextOrderStatus =
    normalizedApprovedAmountCents < refundRequest.order.totalCents
      ? 'PARTIALLY_REFUNDED'
      : 'REFUNDED';

  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: refundRequest.orderId },
      data: { status: nextOrderStatus },
    });

    return tx.refundRequest.update({
      where: { id: refundRequest.id },
      data: {
        status: 'REFUNDED',
        approvedAmountCents: normalizedApprovedAmountCents,
        adminNotes: mergedNotes,
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
      body: `A refund of $${(normalizedApprovedAmountCents / 100).toFixed(2)} was issued to your original payment method.`,
      link: `/orders/${refundRequest.orderId}`,
      data: {
        orderId: refundRequest.orderId,
        refundRequestId: refundRequest.id,
        status: 'REFUNDED',
        stripeRefundId: stripeRefund.id,
      },
    },
  ]);

  return serializeMutationResult(updated);
}

export async function rejectAdminRefundRequest({
  refundRequestId,
  adminNotes,
}: {
  refundRequestId: string;
  adminNotes?: string;
}): Promise<AdminRefundMutationResult> {
  const refundRequest = await requireRefundRequest(refundRequestId);
  assertRefundRequestOpen(refundRequest);

  const denied = await prisma.refundRequest.update({
    where: { id: refundRequest.id },
    data: {
      status: 'DENIED',
      adminNotes: adminNotes?.trim() || null,
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

  return serializeMutationResult(denied);
}

export async function resolveAdminRefundRequest({
  refundRequestId,
  adminNotes,
}: {
  refundRequestId: string;
  adminNotes?: string;
}): Promise<AdminRefundMutationResult> {
  const refundRequest = await requireRefundRequest(refundRequestId);

  if (refundRequest.resolvedAt) {
    return serializeMutationResult(refundRequest);
  }

  const updated = await prisma.refundRequest.update({
    where: { id: refundRequest.id },
    data: {
      adminNotes: adminNotes?.trim() || refundRequest.adminNotes || null,
      resolvedAt: new Date(),
    },
  });

  return serializeMutationResult(updated);
}
