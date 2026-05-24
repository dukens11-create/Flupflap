import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { resolveGarageSaleByRouteParam } from '@/lib/garage-sales';
import {
  getSellerRefundHistoryWriteErrorMessage,
  getSellerRefundHistoryWriteErrorStatus,
  recordSellerRefundHistory,
} from '@/lib/seller-refund-history';

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

  const stripeRefund = await stripe.refunds.create({
    payment_intent: latestPaid.stripePaymentId,
    metadata: {
      type: 'garage_sale_listing',
      saleId: sale.id,
      sellerId: sale.sellerId,
      action: isAdmin ? 'admin_refund' : 'seller_refund',
    },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.garageSalePayment.update({
        where: { id: latestPaid.id },
        data: { status: 'REFUNDED' },
      });
      await tx.garageSale.update({
        where: { id: sale.id },
        data: {
          paymentStatus: 'REFUNDED',
          status: 'HIDDEN',
          isArchived: true,
          archivedAt: new Date(),
          isFeatured: false,
        },
      });
      await recordSellerRefundHistory({
        sellerId: sale.sellerId,
        saleId: sale.id,
        refundType: isAdmin ? 'admin_garage_sale_refund' : 'garage_sale_refund',
        sourceLabel: isAdmin ? 'Admin garage sale refund' : 'Garage sale refund',
        stripePaymentIntentId: latestPaid.stripePaymentId,
        stripeRefundId: stripeRefund.id,
        amountCents: Number.isFinite(stripeRefund.amount) ? stripeRefund.amount : latestPaid.amountCents,
        currency: stripeRefund.currency ?? null,
        status: stripeRefund.status ?? 'succeeded',
        reason: 'Garage sale listing refund',
        refundedAt: Number.isFinite(stripeRefund.created) ? new Date(stripeRefund.created * 1000) : new Date(),
        resolvedAt: new Date(),
      }, tx);
    });
  } catch (error) {
    console.error('[api/garage-sales/[id]/refund] Failed to persist seller refund history.', {
      saleId: sale.id,
      stripeRefundId: stripeRefund.id,
      error,
    });
    return NextResponse.json(
      { error: getSellerRefundHistoryWriteErrorMessage(error) },
      { status: getSellerRefundHistoryWriteErrorStatus(error) },
    );
  }

  const refunded = await prisma.garageSale.findUnique({
    where: { id: sale.id },
  });

  return NextResponse.json(refunded);
}
