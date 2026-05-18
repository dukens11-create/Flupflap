import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { NotificationType } from '@prisma/client';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createNotifications } from '@/lib/notifications';
import { normalizeRefundAmountCents } from '@/lib/refunds';
import { stripe } from '@/lib/stripe';

const approveSchema = z.object({
  approvedAmountCents: z.number().int().positive().optional(),
  note: z.string().trim().max(2000).optional(),
});

async function parseJsonBody(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (!raw) return {};
  return JSON.parse(raw);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await parseJsonBody(req);
    const parsed = approveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 422 });
    }

    const { id } = await params;
    const refundRequest = await prisma.refundRequest.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            totalCents: true,
            stripePaymentIntentId: true,
          },
        },
      },
    });

    if (!refundRequest) {
      return NextResponse.json({ success: false, error: 'Refund request not found.' }, { status: 404 });
    }

    if (['APPROVED', 'DENIED', 'REFUNDED'].includes(refundRequest.status)) {
      return NextResponse.json({ success: false, error: 'This refund request is already resolved.' }, { status: 400 });
    }

    if (!refundRequest.order.stripePaymentIntentId) {
      return NextResponse.json({ success: false, error: 'No Stripe payment intent found for this refund.' }, { status: 400 });
    }

    const approvedAmountCents = normalizeRefundAmountCents(
      parsed.data.approvedAmountCents ?? refundRequest.requestedAmountCents,
      refundRequest.order.totalCents,
    );
    const adminNotes = parsed.data.note ?? refundRequest.adminNotes ?? null;

    const stripeRefund = await stripe.refunds.create({
      payment_intent: refundRequest.order.stripePaymentIntentId,
      amount: approvedAmountCents,
      metadata: {
        orderId: refundRequest.orderId,
        refundRequestId: refundRequest.id,
        approvedBy: session.user.id,
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
        select: {
          id: true,
          status: true,
          approvedAmountCents: true,
          adminNotes: true,
          stripeRefundId: true,
          resolvedAt: true,
        },
      });
    });

    await createNotifications([
      {
        userId: refundRequest.buyerId,
        type: NotificationType.ORDER_UPDATE,
        title: 'Refund completed',
        body: `A refund of $${(approvedAmountCents / 100).toFixed(2)} was issued to your original payment method.`,
        link: `/orders/${refundRequest.orderId}`,
        data: { orderId: refundRequest.orderId, refundRequestId: refundRequest.id, status: 'REFUNDED', stripeRefundId: stripeRefund.id },
      },
    ]);

    return NextResponse.json({
      success: true,
      refund: {
        ...updated,
        resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: 'Invalid JSON payload.' }, { status: 400 });
    }
    console.error('[api/admin/refunds/[id]/approve] Failed to approve refund', error);
    return NextResponse.json({ success: false, error: 'Failed to approve refund. Please try again.' }, { status: 500 });
  }
}
