import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { deriveGarageSaleLifecycle } from '@/lib/garage-sale-lifecycle';
import { syncGarageSaleCheckoutSessionForSeller } from '@/lib/garage-sale-payment-sync';
import { logWarn } from '@/lib/logger';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: {
      id: true,
      sellerId: true,
      status: true,
      paymentStatus: true,
      isArchived: true,
      startDate: true,
      endDate: true,
      isLive: true,
    },
  });
  if (!sale) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (sale.sellerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let checkoutSessionId: string | undefined;
  try {
    const body = await req.json() as { checkoutSessionId?: string };
    if (typeof body.checkoutSessionId === 'string' && body.checkoutSessionId.trim()) {
      checkoutSessionId = body.checkoutSessionId.trim();
    }
  } catch {
    // optional payload
  }

  let syncReason: string | undefined;
  let synced = false;
  if (checkoutSessionId) {
    const syncResult = await syncGarageSaleCheckoutSessionForSeller({
      checkoutSessionId,
      saleId: id,
      sellerId: session.user.id,
    });
    syncReason = syncResult.reason;
    synced = syncResult.synced;
    if (!synced && syncReason !== 'already_paid' && syncReason !== 'payment_not_paid') {
      logWarn('Garage sale payment reconcile did not sync', {
        tag: 'garage-sales/payment-reconcile',
        action: 'syncGarageSaleCheckoutSessionForSeller',
        saleId: id,
        reason: syncReason ?? 'unknown',
      });
    }
  }

  const latest = await prisma.garageSale.findUnique({
    where: { id },
    select: {
      status: true,
      paymentStatus: true,
      isArchived: true,
      startDate: true,
      endDate: true,
      isLive: true,
    },
  });
  if (!latest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const lifecycle = deriveGarageSaleLifecycle(latest);
  return NextResponse.json({
    state: lifecycle.state,
    ownerMessage: lifecycle.ownerMessage,
    publiclyVisible: lifecycle.publiclyVisible,
    synced,
    reason: syncReason,
  });
}
