import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { REVIEWABLE_ORDER_STATUSES } from '@/lib/order-feedback';

const schema = z.object({
  sellerId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(3).max(2000),
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
      return NextResponse.json({ error: 'Invalid review data.' }, { status: 400 });
    }

    const { sellerId, rating, comment } = parsed.data;
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

    if (!REVIEWABLE_ORDER_STATUSES.includes(order.status as (typeof REVIEWABLE_ORDER_STATUSES)[number])) {
      return NextResponse.json({ error: 'Reviews are only available for completed orders.' }, { status: 400 });
    }

    const orderSellerIds = new Set(order.items.map((item) => item.product.sellerId));
    if (!orderSellerIds.has(sellerId)) {
      return NextResponse.json({ error: 'Seller is not part of this order.' }, { status: 400 });
    }

    await prisma.sellerReview.upsert({
      where: {
        buyerId_sellerId_orderId: {
          buyerId: session.user.id,
          sellerId,
          orderId,
        },
      },
      create: {
        buyerId: session.user.id,
        sellerId,
        orderId,
        rating,
        comment,
      },
      update: {
        rating,
        comment,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[orders/[id]/review POST]', err);
    return NextResponse.json({ error: 'Failed to submit review.' }, { status: 500 });
  }
}
