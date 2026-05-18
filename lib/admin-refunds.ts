import type { RefundRequestStatus } from '@prisma/client';
import { prisma } from '@/lib/db';

export type AdminRefundListItem = {
  id: string;
  orderId: string;
  buyer: string;
  seller: string;
  requestedAmountCents: number;
  approvedAmountCents: number | null;
  reason: string;
  details: string | null;
  status: RefundRequestStatus;
  stripePaymentIntentId: string | null;
  stripeRefundId: string | null;
  adminNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export async function getRefundsForAdminDashboard(): Promise<{ refunds: AdminRefundListItem[]; fetchFailed: boolean }> {
  try {
    const refundRequests = await prisma.refundRequest.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderId: true,
        status: true,
        reason: true,
        details: true,
        requestedAmountCents: true,
        approvedAmountCents: true,
        adminNotes: true,
        stripeRefundId: true,
        createdAt: true,
        resolvedAt: true,
        buyer: {
          select: {
            name: true,
            email: true,
          },
        },
        seller: {
          select: {
            name: true,
            email: true,
          },
        },
        order: {
          select: {
            stripePaymentIntentId: true,
          },
        },
      },
    });

    return {
      refunds: refundRequests.map((request) => ({
        id: request.id,
        orderId: request.orderId,
        buyer: request.buyer.name ?? request.buyer.email,
        seller: request.seller.name ?? request.seller.email,
        requestedAmountCents: request.requestedAmountCents,
        approvedAmountCents: request.approvedAmountCents,
        reason: request.reason,
        details: request.details,
        status: request.status,
        stripePaymentIntentId: request.order.stripePaymentIntentId,
        stripeRefundId: request.stripeRefundId,
        adminNotes: request.adminNotes,
        createdAt: request.createdAt.toISOString(),
        resolvedAt: request.resolvedAt?.toISOString() ?? null,
      })),
      fetchFailed: false,
    };
  } catch (error) {
    console.error('[admin/refunds] Failed to fetch refund requests', error);
    return { refunds: [], fetchFailed: true };
  }
}
