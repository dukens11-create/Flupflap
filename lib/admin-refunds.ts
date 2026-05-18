import { NotificationType } from '@prisma/client';
import { prisma } from '@/lib/db';
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
    stripePaymentIntentId: string | null;
  };
};

type AdminRefundActionResult<T = Record<string, unknown>> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

type AdminRefundActionInput = {
  id: string;
  adminUserId: string;
  adminNotes?: string;
  approvedAmountCents?: number;
};

export async function getAdminRefundRequests(): Promise<{ refunds: AdminRefundListItem[]; loadError: boolean }> {
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
      refunds: refundRequests.map((request) => ({
        ...request,
        createdAt: request.createdAt.toISOString(),
        resolvedAt: request.resolvedAt?.toISOString() ?? null,
      })),
      loadError: false,
    };
  } catch (error) {
    console.error('[admin/refunds] Failed to fetch refund requests.', error);
    return { refunds: [], loadError: true };
  }
}

export async function approveRefundRequest({
  id,
  adminUserId,
  adminNotes,
  approvedAmountCents: requestedApprovedAmountCents,
}: AdminRefundActionInput): Promise<AdminRefundActionResult> {
  try {
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
      return { ok: false, status: 404, error: 'Refund request not found.' };
    }

    if (['DENIED', 'REFUNDED'].includes(refundRequest.status)) {
      return { ok: false, status: 400, error: 'This refund request is already resolved.' };
    }

    if (!refundRequest.order.stripePaymentIntentId) {
      return { ok: false, status: 400, error: 'No Stripe payment intent found for this order.' };
    }

    const approvedAmountCents = normalizeRefundAmountCents(
      requestedApprovedAmountCents ?? refundRequest.requestedAmountCents,
      refundRequest.order.totalCents,
    );

    const mergedNotes = adminNotes || null;

    await prisma.refundRequest.update({
      where: { id: refundRequest.id },
      data: {
        status: 'APPROVED',
        approvedAmountCents,
        adminNotes: mergedNotes,
      },
    });

    const stripeRefund = await stripe.refunds.create({
      payment_intent: refundRequest.order.stripePaymentIntentId,
      amount: approvedAmountCents,
      metadata: {
        orderId: refundRequest.orderId,
        refundRequestId: refundRequest.id,
        approvedBy: adminUserId,
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
          adminNotes: mergedNotes,
          stripeRefundId: stripeRefund.id,
          resolvedAt,
        },
      });
    });

    try {
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
          body: `A refund of $${(approvedAmountCents / 100).toFixed(2)} was issued to your original payment method.`,
          link: `/orders/${refundRequest.orderId}`,
          data: { orderId: refundRequest.orderId, refundRequestId: refundRequest.id, status: 'REFUNDED', stripeRefundId: stripeRefund.id },
        },
      ]);
    } catch (error) {
      console.error(`[admin/refunds] Refund approved but notification failed for request ${id}.`, error);
    }

    return { ok: true, status: 200, data: updated };
  } catch (error) {
    console.error(`[admin/refunds] Failed to approve refund request ${id}.`, error);
    return { ok: false, status: 500, error: 'Failed to approve refund request.' };
  }
}

export async function rejectRefundRequest({
  id,
  adminNotes,
}: AdminRefundActionInput): Promise<AdminRefundActionResult> {
  try {
    const refundRequest = await prisma.refundRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        buyerId: true,
        orderId: true,
      },
    });

    if (!refundRequest) {
      return { ok: false, status: 404, error: 'Refund request not found.' };
    }

    if (['DENIED', 'REFUNDED'].includes(refundRequest.status)) {
      return { ok: false, status: 400, error: 'This refund request is already resolved.' };
    }

    const rejected = await prisma.refundRequest.update({
      where: { id: refundRequest.id },
      data: {
        status: 'DENIED',
        adminNotes: adminNotes || null,
        resolvedAt: new Date(),
      },
    });

    try {
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
    } catch (error) {
      console.error(`[admin/refunds] Refund rejected but notification failed for request ${id}.`, error);
    }

    return { ok: true, status: 200, data: rejected };
  } catch (error) {
    console.error(`[admin/refunds] Failed to reject refund request ${id}.`, error);
    return { ok: false, status: 500, error: 'Failed to reject refund request.' };
  }
}

export async function resolveRefundRequest({
  id,
  adminNotes,
}: AdminRefundActionInput): Promise<AdminRefundActionResult> {
  try {
    const refundRequest = await prisma.refundRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
      },
    });

    if (!refundRequest) {
      return { ok: false, status: 404, error: 'Refund request not found.' };
    }

    const resolved = await prisma.refundRequest.update({
      where: { id: refundRequest.id },
      data: {
        resolvedAt: new Date(),
        ...(adminNotes !== undefined ? { adminNotes: adminNotes || null } : {}),
      },
    });

    return { ok: true, status: 200, data: resolved };
  } catch (error) {
    console.error(`[admin/refunds] Failed to mark refund request ${id} as resolved.`, error);
    return { ok: false, status: 500, error: 'Failed to mark refund request as resolved.' };
  }
}
