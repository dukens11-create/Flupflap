import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { resolveGarageSaleByRouteParam } from '@/lib/garage-sales';
import { syncGarageSaleCheckoutSessionForSeller } from '@/lib/garage-sale-payment-sync';
import { logInfo, logWarn } from '@/lib/logger';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const resolvedSale = await resolveGarageSaleByRouteParam(id, 'api/garage-sales/[id]/sync-payment');
  if (!resolvedSale) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  const sale = await prisma.garageSale.findUnique({
    where: { id: resolvedSale.id },
    select: {
      id: true,
      sellerId: true,
      stripeCheckoutId: true,
      paymentStatus: true,
      status: true,
      payments: {
        where: { stripeCheckoutId: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { stripeCheckoutId: true },
      },
    },
  });
  if (!sale) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  const isOwner = session.user.id === sale.sellerId;
  if (!isOwner) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const checkoutSessionId = sale.stripeCheckoutId ?? sale.payments[0]?.stripeCheckoutId ?? null;
  if (!checkoutSessionId) {
    return NextResponse.json({ ok: false, reason: 'missing_checkout_session', message: 'No Stripe checkout session found to sync.' }, { status: 400 });
  }

  logInfo('Garage sale seller payment sync requested', {
    tag: 'api/garage-sales/[id]/sync-payment',
    saleId: sale.id,
    sellerId: sale.sellerId,
    stripeCheckoutId: checkoutSessionId,
    paymentStatus: sale.paymentStatus,
    status: sale.status,
  });

  const syncResult = await syncGarageSaleCheckoutSessionForSeller({
    checkoutSessionId,
    saleId: sale.id,
    sellerId: sale.sellerId,
  });

  if (!syncResult.synced && syncResult.reason !== 'already_paid') {
    logWarn('Garage sale seller payment sync did not reconcile listing', {
      tag: 'api/garage-sales/[id]/sync-payment',
      saleId: sale.id,
      sellerId: sale.sellerId,
      stripeCheckoutId: checkoutSessionId,
      reason: syncResult.reason ?? 'unknown',
    });
  }

  return NextResponse.json({
    ok: syncResult.synced || syncResult.reason === 'already_paid',
    reason: syncResult.reason,
  });
}
