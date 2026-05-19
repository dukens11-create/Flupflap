import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireSeller } from '@/lib/require-seller';
import { expireGarageSales } from '@/lib/garage-sales';
import { syncGarageSaleCheckoutSessionForSeller } from '@/lib/garage-sale-payment-sync';
import { logWarn } from '@/lib/logger';
import { deriveGarageSaleLifecycle } from '@/lib/garage-sale-lifecycle';
import SellerGarageSaleCancelPaymentButton from '@/components/SellerGarageSaleCancelPaymentButton';

export const metadata: Metadata = {
  title: 'My Garage Sales',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  LIVE: 'badge-green',
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
  cancelled?: string;
  saleId?: string;
  session_id?: string;
}>;

const STATUS_LABEL: Record<string, string> = {
  LIVE: 'LIVE',
  OPEN: 'ACTIVE',
  UPCOMING: 'GARAGE SALE',
  PENDING_REVIEW: 'UNDER REVIEW',
  PAYMENT_PENDING: 'PAYMENT PENDING',
  PAYMENT_FAILED: 'PAYMENT FAILED',
  PAYMENT_REFUNDED: 'REFUNDED',
  REJECTED: 'REJECTED',
  HIDDEN: 'HIDDEN',
  EXPIRED: 'EXPIRED',
};

const PAYMENT_LABEL: Record<string, string> = {
  PAID: 'Paid',
  PENDING: 'Confirming payment',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
};
const PAID_QUERY_FLAG = '1';
const PENDING_CANCEL_PAYMENT_STATUSES = new Set([
  'PENDING',
  'PROCESSING',
  'CONFIRMING',
  'REQUIRES_PAYMENT_METHOD',
  'REQUIRES_ACTION',
  'UNPAID',
]);

function shouldWarnOnSyncFailure(reason?: string) {
  return reason !== 'already_paid' && reason !== 'payment_not_paid';
}

function isCancelledPaymentSale(sale: { paymentStatus: string; isArchived: boolean }) {
  return sale.paymentStatus === 'FAILED' && sale.isArchived;
}

function canCancelPendingPayment(sale: { paymentStatus: string; status: string; isArchived: boolean }) {
  const isPendingLike = PENDING_CANCEL_PAYMENT_STATUSES.has(sale.paymentStatus);
  const isHiddenOrNotActive = sale.status !== 'APPROVED' || sale.isArchived;
  const isRefunded = sale.paymentStatus === 'REFUNDED';
  const isAlreadyCancelled = isCancelledPaymentSale(sale);
  return isPendingLike && isHiddenOrNotActive && !isRefunded && !isAlreadyCancelled;
}

export default async function SellerGarageSalesPage({
  searchParams,
}: {
  searchParams: SellerGarageSalesSearchParams;
}) {
  const { sellerId } = await requireSeller();
  const sp = await searchParams;
  const saleId = typeof sp.saleId === 'string' ? sp.saleId : undefined;
  const sessionId = typeof sp.session_id === 'string' ? sp.session_id : undefined;

  if (sp.paid === PAID_QUERY_FLAG && saleId && sessionId) {
    const syncResult = await syncGarageSaleCheckoutSessionForSeller({
      checkoutSessionId: sessionId,
      saleId,
      sellerId,
    });
    if (!syncResult.synced && shouldWarnOnSyncFailure(syncResult.reason)) {
      logWarn('Seller garage sale payment sync did not finalize', {
        tag: 'seller/garage-sales',
        action: 'syncGarageSaleCheckoutSessionForSeller',
        saleId,
        reason: syncResult.reason ?? 'unknown',
      });
    }
    if (syncResult.synced || syncResult.reason === 'already_paid') {
      const ownedSale = await prisma.garageSale.findFirst({
        where: { id: saleId, sellerId },
        select: { id: true },
      });
      if (ownedSale) {
        redirect(`/seller/garage-sales?paid=1&saleId=${encodeURIComponent(ownedSale.id)}`);
      }
    }
  }
  await expireGarageSales();

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

  const focusedSale = saleId ? sales.find((sale) => sale.id === saleId) : null;
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
      {sp.cancelled === '1' && (
        <div className="card border-green-200 bg-green-50 p-4 text-sm text-green-900">
          Pending payment cancelled.
        </div>
      )}
      {sp.paid === PAID_QUERY_FLAG && (
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
            const showCancelPayment = canCancelPendingPayment(sale);
            const showRepost = lifecycle.state === 'EXPIRED' && sale.paymentStatus === 'PAID';
            const paymentLabel = isCancelledPaymentSale(sale)
              ? 'Cancelled'
              : (PAYMENT_LABEL[sale.paymentStatus] ?? 'Unknown');
            return (
              <div key={sale.id} className="card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                  <div className="flex flex-col gap-2 sm:items-end">
                    <div className="flex flex-wrap gap-2">
                      <span className={`badge ${STATUS_BADGE[lifecycle.state] ?? 'badge-slate'}`}>
                        {STATUS_LABEL[lifecycle.state] ?? lifecycle.state}
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold text-slate-500">Payment: {paymentLabel}</p>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/garage-sales/${sale.id}`} className="btn-outline text-xs">Open</Link>
                      <Link href={`/garage-sales/${sale.id}`} className="btn-outline text-xs">View details</Link>
                      {showCancelPayment && <SellerGarageSaleCancelPaymentButton saleId={sale.id} />}
                      {showRepost && (
                        <form action={`/api/garage-sales/${sale.id}/repost`} method="POST">
                          <button type="submit" className="btn-brand text-xs">
                            Repost
                          </button>
                        </form>
                      )}
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
