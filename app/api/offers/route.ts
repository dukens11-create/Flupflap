import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { NotificationType } from '@prisma/client';
import { z } from 'zod';
import { createNotifications } from '@/lib/notifications';

const createSchema = z.object({
  productId: z.string().min(1),
  amountCents: z.number().int().positive(),
  message: z.string().trim().max(500).optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 });
    }

    const [received, sent] = await Promise.all([
      prisma.offer.findMany({
        where: { sellerId: userId },
        include: {
          product: { select: { id: true, title: true, imageUrl: true, priceCents: true, status: true } },
          buyer: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.offer.findMany({
        where: { buyerId: userId },
        include: {
          product: { select: { id: true, title: true, imageUrl: true, priceCents: true, status: true } },
          seller: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return NextResponse.json({ received, sent });
  } catch (error) {
    console.error('[offers GET]', error);
    return NextResponse.json({ error: 'Failed to load offers.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const buyerId = session.user.id;
    if (!buyerId) {
      return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 });
    }

    let parsed: z.infer<typeof createSchema>;
    try {
      parsed = createSchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: parsed.productId },
      select: {
        id: true,
        title: true,
        priceCents: true,
        sellerId: true,
        status: true,
        inventory: true,
      },
    });

    if (!product || product.status !== 'APPROVED' || product.inventory <= 0) {
      return NextResponse.json({ error: 'This listing is not accepting offers.' }, { status: 400 });
    }

    if (product.sellerId === buyerId) {
      return NextResponse.json({ error: 'You cannot send an offer to yourself.' }, { status: 400 });
    }

    if (parsed.amountCents >= product.priceCents) {
      return NextResponse.json({ error: 'Offers must be below the listing price.' }, { status: 400 });
    }

    const existingPendingOffer = await prisma.offer.findFirst({
      where: {
        productId: product.id,
        buyerId,
        status: 'PENDING',
      },
    });

    if (existingPendingOffer) {
      return NextResponse.json({ error: 'You already have a pending offer on this listing.' }, { status: 400 });
    }

    const offer = await prisma.offer.create({
      data: {
        productId: product.id,
        buyerId,
        sellerId: product.sellerId,
        amountCents: parsed.amountCents,
        message: parsed.message || null,
      },
    });

    const buyerName = session.user.name || 'A buyer';
    const offerAmount = (parsed.amountCents / 100).toFixed(2);

    await createNotifications([
      {
        userId: product.sellerId,
        type: NotificationType.OFFER,
        title: `New offer for ${product.title}`,
        body: `${buyerName} offered $${offerAmount}.`,
        link: '/offers',
        data: { offerId: offer.id, productId: product.id },
      },
      {
        userId: buyerId,
        type: NotificationType.OFFER,
        title: `Offer sent for ${product.title}`,
        body: `Your $${offerAmount} offer is waiting for the seller.`,
        link: '/offers',
        data: { offerId: offer.id, productId: product.id },
      },
    ]);

    return NextResponse.json({ offerId: offer.id }, { status: 201 });
  } catch (error) {
    console.error('[offers POST]', error);
    return NextResponse.json({ error: 'Failed to submit offer. Please try again.' }, { status: 500 });
  }
}
