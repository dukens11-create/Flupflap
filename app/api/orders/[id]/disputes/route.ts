import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { DISPUTE_ELIGIBLE_ORDER_STATUSES } from '@/lib/disputes';

const schema = z.object({
  orderItemId: z.string().min(1),
  reason: z.enum(['item_not_received', 'not_as_described', 'arrived_damaged', 'routine_return', 'other']),
  requestedResolution: z.enum(['refund_only', 'return_for_refund']),
  description: z.string().min(20).max(2000),
  evidenceUrls: z.array(z.string().url()).max(3).default([]),
});

function redirectToOrder(req: Request, orderId: string, dispute: string) {
  return NextResponse.redirect(new URL(`/orders/${orderId}?dispute=${dispute}`, req.url));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    const { id } = await params;
    const form = await req.formData();
    const parsed = schema.parse({
      orderItemId: form.get('orderItemId'),
      reason: form.get('reason'),
      requestedResolution: form.get('requestedResolution'),
      description: form.get('description'),
      evidenceUrls: form.getAll('evidenceUrls'),
    });

    const order = await prisma.order.findFirst({
      where: {
        id,
        buyerId: session.user.id,
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                sellerId: true,
                returnWindowDays: true,
              },
            },
            dispute: { select: { id: true } },
          },
        },
      },
    });

    if (!order) {
      return redirectToOrder(req, id, 'not-found');
    }

    if (!DISPUTE_ELIGIBLE_ORDER_STATUSES.includes(order.status as (typeof DISPUTE_ELIGIBLE_ORDER_STATUSES)[number])) {
      return redirectToOrder(req, id, 'not-eligible');
    }

    const orderItem = order.items.find((item) => item.id === parsed.orderItemId);
    if (!orderItem) {
      return redirectToOrder(req, id, 'not-found');
    }

    if (orderItem.dispute) {
      return redirectToOrder(req, id, 'exists');
    }

    await prisma.orderItemDispute.create({
      data: {
        orderItemId: orderItem.id,
        buyerId: session.user.id,
        sellerId: orderItem.product.sellerId,
        reason: parsed.reason,
        requestedResolution: parsed.requestedResolution,
        description: parsed.description,
        evidenceUrls: parsed.evidenceUrls,
        returnWindowDaysSnapshot: orderItem.product.returnWindowDays,
      },
    });

    return redirectToOrder(req, id, 'created');
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      const { id } = await params;
      return redirectToOrder(req, id, 'invalid');
    }
    console.error('[orders/[id]/disputes POST]', err);
    const { id } = await params;
    return redirectToOrder(req, id, 'error');
  }
}
