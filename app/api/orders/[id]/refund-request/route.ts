import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { NotificationType } from '@prisma/client';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createNotifications } from '@/lib/notifications';
import { isOrderRefundEligible, normalizeRefundAmountCents } from '@/lib/refunds';

const createRefundSchema = z.object({
  reason: z.string().trim().min(3).max(120),
  details: z.string().trim().max(2000).optional(),
  requestedAmountCents: z.number().int().positive().optional(),
});

async function getOrderForRefund(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      status: true,
      totalCents: true,
      items: {
        select: {
          product: {
            select: {
              sellerId: true,
            },
          },
        },
      },
      refundRequest: {
        select: {
          id: true,
          status: true,
          reason: true,
          details: true,
          requestedAmountCents: true,
          approvedAmountCents: true,
          adminNotes: true,
          sellerResponse: true,
          stripeRefundId: true,
          createdAt: true,
          updatedAt: true,
          resolvedAt: true,
        },
      },
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const order = await getOrderForRefund(id);
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  const sellerIds = Array.from(new Set(order.items.map((item) => item.product.sellerId)));
  const canAccess = session.user.role === 'ADMIN'
    || session.user.id === order.buyerId
    || (session.user.role === 'SELLER' && sellerIds.includes(session.user.id));

  if (!canAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    orderId: order.id,
    orderStatus: order.status,
    refundRequest: order.refundRequest,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const order = await getOrderForRefund(id);
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  if (session.user.id !== order.buyerId) {
    return NextResponse.json({ error: 'Only the buyer can request a refund for this order.' }, { status: 403 });
  }

  if (order.refundRequest) {
    return NextResponse.json({ error: 'A refund request already exists for this order.' }, { status: 409 });
  }

  if (!isOrderRefundEligible(order.status)) {
    return NextResponse.json({ error: 'This order is not eligible for a refund request.' }, { status: 400 });
  }

  const sellerIds = Array.from(new Set(order.items.map((item) => item.product.sellerId)));
  if (sellerIds.length !== 1) {
    return NextResponse.json({
      error: 'This order cannot be auto-routed to a single seller and must be reviewed by support manually.',
    }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const parsed = createRefundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 422 });
  }

  const requestedAmountCents = normalizeRefundAmountCents(parsed.data.requestedAmountCents, order.totalCents);

  const refundRequest = await prisma.refundRequest.create({
    data: {
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: sellerIds[0],
      reason: parsed.data.reason,
      details: parsed.data.details || null,
      requestedAmountCents,
      status: 'REQUESTED',
    },
  });

  await createNotifications([
    {
      userId: sellerIds[0],
      type: NotificationType.ORDER_UPDATE,
      title: 'Refund request received',
      body: 'A buyer requested a refund for one of your orders.',
      link: '/seller/refunds',
      data: { orderId: order.id, refundRequestId: refundRequest.id },
    },
  ]);

  return NextResponse.json(refundRequest, { status: 201 });
}
