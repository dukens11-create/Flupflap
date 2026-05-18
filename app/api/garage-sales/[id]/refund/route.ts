import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { resolveGarageSaleByRouteParam } from '@/lib/garage-sales';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const resolvedSale = await resolveGarageSaleByRouteParam(id, 'api/garage-sales/[id]/refund');
  if (!resolvedSale) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sale = await prisma.garageSale.findUnique({
    where: { id: resolvedSale.id },
  });

  if (!sale) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isOwner = sale.sellerId === session.user.id;
  const isAdmin = session.user.role === 'ADMIN';

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (sale.paymentStatus !== 'PAID') {
    return NextResponse.json({ error: 'Only paid listings can be refunded' }, { status: 400 });
  }

  const latestPaid = await prisma.garageSalePayment.findFirst({
    where: {
      saleId: sale.id,
      status: 'PAID',
      stripePaymentId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!latestPaid?.stripePaymentId) {
    return NextResponse.json({ error: 'No refundable payment found' }, { status: 400 });
  }

  await stripe.refunds.create({
    payment_intent: latestPaid.stripePaymentId,
  });

  await prisma.$transaction([
    prisma.garageSalePayment.update({
      where: { id: latestPaid.id },
      data: { status: 'REFUNDED' },
    }),
    prisma.garageSale.update({
      where: { id: sale.id },
      data: {
        paymentStatus: 'REFUNDED',
        status: 'HIDDEN',
        isArchived: true,
        archivedAt: new Date(),
        isFeatured: false,
      },
    }),
  ]);

  const refunded = await prisma.garageSale.findUnique({
    where: { id: sale.id },
  });

  return NextResponse.json(refunded);
}
