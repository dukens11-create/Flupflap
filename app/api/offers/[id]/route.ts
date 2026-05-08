import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { NotificationType } from '@prisma/client';
import { z } from 'zod';
import { createNotification } from '@/lib/notifications';

const respondSchema = z.object({
  action: z.enum(['accept', 'reject']),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let parsed: z.infer<typeof respondSchema>;
  try {
    parsed = respondSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }

  const { id } = await params;

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, title: true } },
      buyer: { select: { id: true, name: true } },
    },
  });

  if (!offer || offer.sellerId !== session.user.id) {
    return NextResponse.json({ error: 'Offer not found.' }, { status: 404 });
  }

  if (offer.status !== 'PENDING') {
    return NextResponse.json({ error: 'This offer has already been handled.' }, { status: 400 });
  }

  const nextStatus = parsed.action === 'accept' ? 'ACCEPTED' : 'REJECTED';

  await prisma.offer.update({
    where: { id: offer.id },
    data: {
      status: nextStatus,
      respondedAt: new Date(),
    },
  });

  const sellerName = session.user.name || 'The seller';
  const offerAmount = (offer.amountCents / 100).toFixed(2);
  const accepted = parsed.action === 'accept';

  await createNotification({
    userId: offer.buyerId,
    type: NotificationType.OFFER,
    title: accepted
      ? `Offer accepted for ${offer.product.title}`
      : `Offer declined for ${offer.product.title}`,
    body: accepted
      ? `${sellerName} accepted your $${offerAmount} offer.`
      : `${sellerName} declined your $${offerAmount} offer.`,
    link: '/offers',
    data: { offerId: offer.id, productId: offer.product.id },
  });

  return NextResponse.json({ ok: true });
}
