import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { NotificationType } from '@prisma/client';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createNotifications } from '@/lib/notifications';
import { normalizeRefundAmountCents } from '@/lib/refunds';
import { stripe } from '@/lib/stripe';

const adminRefundSchema = z.object({
  action: z.enum(['approve', 'deny']),
  approvedAmountCents: z.number().int().positive().optional(),
  adminNotes: z.string().trim().max(2000).optional(),
});

const CONNECT_REVERSAL_TODO = 'TODO: Stripe Connect transfer reversal for seller payouts is not automated in this flow yet.';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const parsed = adminRefundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 422 });
  }

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
    return NextResponse.json({ error: 'Refund request not found.' }, { status: 404 });
  }

  if (['DENIED', 'REFUNDED'].includes(refundRequest.status)) {
    return NextResponse.json({ error: 'This refund request is already resolved.' }, { status: 400 });
  }

  if (parsed.data.action === 'deny') {
    const denied = await prisma.refundRequest.update({
      where: { id: refundRequest.id },
      data: {
        status: 'DENIED',
        adminNotes: parsed.data.adminNotes || null,
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

    return NextResponse.json(denied);
  }

  if (!refundRequest.order.stripePaymentIntentId) {
    return NextResponse.json({ error: 'No Stripe payment intent found for this order.' }, { status: 400 });
  }

  const approvedAmountCents = normalizeRefundAmountCents(
    parsed.data.approvedAmountCents ?? refundRequest.requestedAmountCents,
    refundRequest.order.totalCents,
  );

  const mergedNotes = [parsed.data.adminNotes, CONNECT_REVERSAL_TODO].filter(Boolean).join('\n');

  await prisma.refundRequest.update({
    where: { id: refundRequest.id },
    data: {
      status: 'APPROVED',
      approvedAmountCents,
      adminNotes: mergedNotes || null,
    },
  });

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
        adminNotes: mergedNotes || null,
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
      body: `A refund of $${(approvedAmountCents / 100).toFixed(2)} was issued to your original payment method.`,
      link: `/orders/${refundRequest.orderId}`,
      data: { orderId: refundRequest.orderId, refundRequestId: refundRequest.id, status: 'REFUNDED', stripeRefundId: stripeRefund.id },
    },
  ]);

  return NextResponse.json(updated);
}
