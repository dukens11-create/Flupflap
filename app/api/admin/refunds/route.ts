import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import type { RefundRequestStatus } from '@prisma/client';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isSchemaNotInitializedError } from '@/lib/db-errors';
import { ADMIN_REFUNDS_LOAD_ERROR, ADMIN_REFUNDS_SCHEMA_INIT_ERROR } from '@/lib/admin-refunds-errors';

const REFUND_MODEL_NAME = 'refundRequest';
const REFUND_TABLE_NAME = 'RefundRequest';

type RefundRecord = {
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

function serializeRefundRequest(refundRequest: {
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
}): RefundRecord {
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

export async function GET() {
  console.info('[api/admin/refunds] GET route hit');

  let session: Session | null;
  try {
    session = await getServerSession(authOptions);
  } catch (error) {
    console.error('[api/admin/refunds] Failed to resolve session', { error });
    return NextResponse.json({ refunds: [], error: 'Admin access required.' }, { status: 401 });
  }

  const adminUserId = session?.user?.id ?? null;
  console.info('[api/admin/refunds] Session user', { adminUserId, role: session?.user?.role ?? null });

  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ refunds: [], error: 'Admin access required.' }, { status: session?.user ? 403 : 401 });
  }

  console.info('[api/admin/refunds] Querying model', { model: REFUND_MODEL_NAME, table: REFUND_TABLE_NAME });

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

    return NextResponse.json({
      refunds: refundRequests.map(serializeRefundRequest),
    });
  } catch (error) {
    const schemaNotInitialized = isSchemaNotInitializedError(error);
    console.error('[api/admin/refunds] Query failed', {
      model: REFUND_MODEL_NAME,
      table: REFUND_TABLE_NAME,
      adminUserId,
      schemaNotInitialized,
      error,
    });
    return NextResponse.json(
      {
        refunds: [],
        error: schemaNotInitialized
          ? ADMIN_REFUNDS_SCHEMA_INIT_ERROR
          : ADMIN_REFUNDS_LOAD_ERROR,
      },
      { status: 500 },
    );
  }
}
