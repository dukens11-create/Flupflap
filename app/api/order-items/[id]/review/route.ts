import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isReviewEligibleStatus } from '@/lib/reviews';

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'You must be signed in to leave a review.' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid review data.' }, { status: 400 });
    }

    const orderItem = await prisma.orderItem.findFirst({
      where: {
        id,
        order: { buyerId: session.user.id },
      },
      include: {
        order: { select: { status: true } },
        product: { select: { id: true } },
      },
    });

    if (!orderItem) {
      return NextResponse.json({ error: 'Order item not found.' }, { status: 404 });
    }

    if (!isReviewEligibleStatus(orderItem.order.status)) {
      return NextResponse.json({ error: 'This order is not eligible for reviews yet.' }, { status: 400 });
    }

    const hasOpenDispute = await prisma.productReport.count({
      where: {
        productId: orderItem.productId,
        reporterId: session.user.id,
        status: 'OPEN',
      },
    });

    const now = new Date();
    const updatedReview = await prisma.orderItem.update({
      where: { id },
      data: {
        reviewRating: parsed.data.rating,
        reviewComment: parsed.data.comment?.trim() || null,
        reviewCreatedAt: orderItem.reviewCreatedAt ?? now,
        reviewUpdatedAt: now,
        reviewBlockedByDispute: hasOpenDispute > 0,
      },
      select: {
        reviewBlockedByDispute: true,
      },
    });

    return NextResponse.json({
      ok: true,
      reviewBlockedByDispute: updatedReview.reviewBlockedByDispute,
    });
  } catch (err) {
    console.error('[order-items/review POST]', err);
    return NextResponse.json({ error: 'Failed to save review.' }, { status: 500 });
  }
}
