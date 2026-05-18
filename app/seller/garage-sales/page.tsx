import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireSeller } from '@/lib/require-seller';
import { expireGarageSales } from '@/lib/garage-sales';
import { stripe } from '@/lib/stripe';
import { deriveGarageSaleLifecycle } from '@/lib/garage-sale-lifecycle';

export const metadata: Metadata = {
  title: 'My Garage Sales',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  LIVE: 'badge-red',
  OPEN: 'badge-green',
  UPCOMING: 'badge-blue',
  PENDING_REVIEW: 'badge-yellow',
  PAYMENT_PENDING: 'badge-yellow',
  PAYMENT_FAILED: 'badge-red',
  PAYMENT_REFUNDED: 'badge-red',
  REJECTED: 'badge-red',
  HIDDEN: 'badge-slate',
  EXPIRED: 'badge-slate',
};

type SellerGarageSalesSearchParams = Promise<{
  paid?: string;
  created?: string;
  payment?: string;
  saleId?: string;
  session_id?: string;
}>;

const STATUS_LABEL: Record<string, string> = {
  LIVE: 'LIVE',
  OPEN: 'OPEN NOW',
  UPCOMING: 'UPCOMING',
  PENDING_REVIEW: 'PENDING REVIEW',
  PAYMENT_PENDING: 'PAYMENT PENDING',
  PAYMENT_FAILED: 'PAYMENT FAILED',
  PAYMENT_REFUNDED: 'REFUNDED',
  REJECTED: 'REJECTED',
  HIDDEN: 'HIDDEN',
  EXPIRED: 'EXPIRED',
};

async function reconcileSuccessfulCheckout({
  sellerId,
  saleId,
  sessionId,
}: {
  sellerId: string;
  saleId?: string;
  sessionId?: string;
}) {
  if (!saleId || !sessionId) return;

  const sale = await prisma.garageSale.findFirst({
    where: { id: saleId, sellerId },
    select: {
      id: true,
      listingType: true,
      paymentStatus: true,
      status: true,
      stripeCheckoutId: true,
      totalPaidCents: true,
    },
  });

  if (!sale || sale.paymentStatus === 'PAID' || sale.stripeCheckoutId !== sessionId) return;

  try {
    const checkout = await stripe.checkout.sessions.retrieve(sessionId);
    if (checkout.metadata?.type !== 'garage_sale_listing' || checkout.metadata?.saleId !== sale.id) return;
    if (checkout.payment_status !== 'paid') return;
    const paymentIntentId = typeof checkout.payment_intent === 'string'
      ? checkout.payment_intent
      : checkout.payment_intent?.id ?? null;

    const now = new Date();
    await prisma.$transaction([
      prisma.garageSale.update({
        where: { id: sale.id },
        data: {
          status: 'APPROVED',
          paymentStatus: 'PAID',
          stripePaymentId: paymentIntentId,
          paidAt: now,
          activatedAt: now,
          isFeatured: sale.listingType === 'FEATURED',
          totalPaidCents: typeof checkout.amount_total === 'number' ? checkout.amount_total : sale.totalPaidCents,
        },
      }),
      prisma.garageSalePayment.upsert({
        where: { stripeCheckoutId: checkout.id },
        update: {
          status: 'PAID',
          amountCents: typeof checkout.amount_total === 'number' ? checkout.amount_total : sale.totalPaidCents,
          stripePaymentId: paymentIntentId,
        },
        create: {
          saleId: sale.id,
          sellerId,
          amountCents: typeof checkout.amount_total === 'number' ? checkout.amount_total : sale.totalPaidCents,
          status: 'PAID',
          stripeCheckoutId: checkout.id,
          stripePaymentId: paymentIntentId,
        },
      }),
    ]);
  } catch {
    // Non-fatal. Webhook reconciliation will retry.
  }
}

export default async function SellerGarageSalesPage({
  searchParams,
}: {
  searchParams: SellerGarageSalesSearchParams;
}) {
  const { sellerId } = await requireSeller();
  const sp = await searchParams;
  await expireGarageSales();
  await reconcileSuccessfulCheckout({ sellerId, saleId: sp.saleId, sessionId: sp.session_id });

  const sales = await prisma.garageSale.findMany({
    where: { sellerId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      city: true,
      state: true,
      status: true,
      paymentStatus: true,
      isArchived: true,
      isLive: true,
      startDate: true,
      endDate: true,
      totalPaidCents: true,
    },
  });

  const focusedSale = sp.saleId ? sales.find((sale) => sale.id === sp.saleId) : null;
  const focusedSaleLifecycle = focusedSale ? deriveGarageSaleLifecycle(focusedSale) : null;

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-slate-900">My Garage Sales</h1>
          <p className="mt-1 text-sm text-slate-500">Find, open, and manage all your garage sale listings in one place.</p>
        </div>
        <Link href="/garage-sales/new" className="btn-brand">+ Post a Sale</Link>
      </div>

      {sp.payment === 'cancelled' && (
        <div className="card border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          Checkout was cancelled. Your listing is saved here and can be reposted when you&apos;re ready.
        </div>
      )}
      {sp.created === '1' && (
        <div className="card border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Garage sale created successfully. Use the actions below to open or edit it.
        </div>
      )}
      {sp.paid === '1' && (
        <div className={`card p-4 text-sm ${focusedSaleLifecycle?.state === 'PAYMENT_PENDING' ? 'border-yellow-200 bg-yellow-50 text-yellow-900' : 'border-green-200 bg-green-50 text-green-900'}`}>
          {focusedSaleLifecycle?.state === 'PAYMENT_PENDING'
            ? 'Payment confirmation is still pending. We will publish your listing as soon as Stripe confirms it.'
            : 'Payment confirmed.'}{' '}
          {focusedSaleLifecycle ? focusedSaleLifecycle.ownerMessage : 'Your listing appears below.'}
        </div>
      )}

      {sales.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-slate-600">You haven&apos;t posted any garage sales yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => {
            const lifecycle = deriveGarageSaleLifecycle(sale);
            return (
              <div key={sale.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{sale.title}</p>
                    <p className="text-sm text-slate-500">{sale.city}, {sale.state}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {sale.startDate.toLocaleDateString('en-US')} → {sale.endDate.toLocaleDateString('en-US')} · ${(sale.totalPaidCents / 100).toFixed(2)}
                    </p>
                    <p className="mt-2 text-xs text-slate-600">
                      {lifecycle.ownerMessage}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-2">
                      <span className={`badge ${STATUS_BADGE[lifecycle.state] ?? 'badge-slate'}`}>
                        {STATUS_LABEL[lifecycle.state] ?? lifecycle.state}
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold text-slate-500">Payment: {sale.paymentStatus}</p>
                    <div className="flex gap-2">
                      <Link href={`/garage-sales/${sale.id}`} className="btn-outline text-xs">Open</Link>
                      <Link href={`/garage-sales/${sale.id}/edit`} className="btn-outline text-xs">Manage</Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
