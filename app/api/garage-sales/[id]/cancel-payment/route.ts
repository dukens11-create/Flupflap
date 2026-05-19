import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { resolveGarageSaleByRouteParam } from '@/lib/garage-sales';
import { classifyStripeError, stripe } from '@/lib/stripe';

type Params = { params: Promise<{ id: string }> };

const CANCELABLE_INTENT_STATUSES = new Set<Stripe.PaymentIntent.Status>([
  'processing',
  'requires_action',
  'requires_payment_method',
  'requires_confirmation',
  'requires_capture',
]);

function stripeFailureResponse(prefix: string, err: unknown) {
  const details = classifyStripeError(err);
  return NextResponse.json({
    error: `${prefix} ${details.message}`,
    stripeReason: details.reason,
    stripeCode: details.code,
  }, { status: 502 });
}

export async function POST(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const resolvedSale = await resolveGarageSaleByRouteParam(id, 'api/garage-sales/[id]/cancel-payment');
  if (!resolvedSale) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sale = await prisma.garageSale.findUnique({
    where: { id: resolvedSale.id },
    select: {
      id: true,
      sellerId: true,
      paymentStatus: true,
      isArchived: true,
      stripePaymentId: true,
    },
  });
  if (!sale) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (sale.sellerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (sale.paymentStatus === 'REFUNDED') {
    return NextResponse.json({
      ok: true,
      action: 'refunded',
      paymentStatus: 'REFUNDED',
      message: 'Payment was already refunded.',
    });
  }

  if (sale.paymentStatus === 'FAILED' && sale.isArchived) {
    return NextResponse.json({
      ok: true,
      action: 'cancelled',
      paymentStatus: 'FAILED',
      message: 'Pending payment already cancelled.',
    });
  }

  const latestPaymentWithIntent = await prisma.garageSalePayment.findFirst({
    where: { saleId: sale.id, stripePaymentId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { stripePaymentId: true },
  });

  const paymentIntentId = sale.stripePaymentId ?? latestPaymentWithIntent?.stripePaymentId ?? null;
  let paymentIntent: Stripe.PaymentIntent | null = null;
  if (paymentIntentId) {
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (err) {
      return stripeFailureResponse('Unable to check payment status in Stripe.', err);
    }
  }

  const shouldRefund = sale.paymentStatus === 'PAID' || paymentIntent?.status === 'succeeded';

  if (shouldRefund) {
    if (!paymentIntentId) {
      return NextResponse.json({ error: 'A successful payment exists, but no Stripe payment intent was found to refund.' }, { status: 400 });
    }
    try {
      await stripe.refunds.create({
        payment_intent: paymentIntentId,
        metadata: {
          type: 'garage_sale_listing',
          saleId: sale.id,
          sellerId: sale.sellerId,
          action: 'seller_cancel_payment',
        },
      });
    } catch (err) {
      return stripeFailureResponse('Unable to create Stripe refund.', err);
    }

    await prisma.$transaction([
      prisma.garageSalePayment.updateMany({
        where: { saleId: sale.id, status: 'PAID' },
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
          isLive: false,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      action: 'refunded',
      paymentStatus: 'REFUNDED',
      message: 'Payment refunded and listing hidden.',
    });
  }

  if (paymentIntent?.status && paymentIntent.status !== 'canceled' && !CANCELABLE_INTENT_STATUSES.has(paymentIntent.status)) {
    return NextResponse.json({
      error: `Unable to cancel payment intent while Stripe reports status "${paymentIntent.status}".`,
    }, { status: 409 });
  }

  if (paymentIntentId && paymentIntent && paymentIntent.status !== 'canceled') {
    try {
      await stripe.paymentIntents.cancel(paymentIntentId);
    } catch (err) {
      return stripeFailureResponse('Unable to cancel pending payment in Stripe.', err);
    }
  }

  await prisma.$transaction([
    prisma.garageSalePayment.updateMany({
      where: { saleId: sale.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    }),
    prisma.garageSale.update({
      where: { id: sale.id },
      data: {
        paymentStatus: 'FAILED',
        status: 'HIDDEN',
        isArchived: true,
        archivedAt: new Date(),
        isFeatured: false,
        isLive: false,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    action: 'cancelled',
    paymentStatus: 'FAILED',
    message: 'Pending payment cancelled.',
  });
}
