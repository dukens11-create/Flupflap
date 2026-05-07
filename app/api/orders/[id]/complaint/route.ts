import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ReportStatus } from '@prisma/client';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_DESCRIPTION_MIN_LENGTH,
  COMPLAINT_ELIGIBLE_ORDER_STATUSES,
  FEEDBACK_TEXT_MAX_LENGTH,
} from '@/lib/order-feedback';

const schema = z.object({
  sellerId: z.string().min(1),
  category: z.enum(COMPLAINT_CATEGORIES),
  description: z.string().trim().min(COMPLAINT_DESCRIPTION_MIN_LENGTH).max(FEEDBACK_TEXT_MAX_LENGTH),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: orderId } = await params;
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid complaint data.' }, { status: 400 });
    }

    const { sellerId, category, description } = parsed.data;
    const order = await prisma.order.findFirst({
      where: { id: orderId, buyerId: session.user.id },
      select: {
        id: true,
        status: true,
        items: { select: { product: { select: { sellerId: true } } } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (!COMPLAINT_ELIGIBLE_ORDER_STATUSES.includes(order.status as (typeof COMPLAINT_ELIGIBLE_ORDER_STATUSES)[number])) {
      return NextResponse.json({ error: 'Complaints can only be submitted for paid orders.' }, { status: 400 });
    }

    const orderSellerIds = new Set(order.items.map((item) => item.product.sellerId));
    if (!orderSellerIds.has(sellerId)) {
      return NextResponse.json({ error: 'Seller is not part of this order.' }, { status: 400 });
    }

    const existingComplaint = await prisma.buyerComplaint.findUnique({
      where: {
        buyerId_sellerId_orderId: {
          buyerId: session.user.id,
          sellerId,
          orderId,
        },
      },
      select: { status: true },
    });

    if (existingComplaint && existingComplaint.status !== ReportStatus.OPEN) {
      return NextResponse.json(
        { error: 'This complaint has already been reviewed and cannot be modified.' },
        { status: 409 },
      );
    }

    if (existingComplaint) {
      await prisma.buyerComplaint.update({
        where: {
          buyerId_sellerId_orderId: {
            buyerId: session.user.id,
            sellerId,
            orderId,
          },
        },
        data: {
          category,
          description,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.buyerComplaint.create({
        data: {
          buyerId: session.user.id,
          sellerId,
          orderId,
          category,
          description,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[orders/[id]/complaint POST]', err);
    return NextResponse.json({ error: 'Failed to submit complaint.' }, { status: 500 });
  }
}
