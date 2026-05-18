import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireSeller } from '@/lib/require-seller';
import { expireGarageSales } from '@/lib/garage-sales';
import { syncGarageSaleCheckoutSessionForSeller } from '@/lib/garage-sale-payment-sync';
import { logWarn } from '@/lib/logger';

export const metadata: Metadata = {
  title: 'My Garage Sales',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  APPROVED: 'badge-green',
  PENDING: 'badge-yellow',
  HIDDEN: 'badge-red',
  REJECTED: 'badge-red',
  EXPIRED: 'badge-slate',
};

type SellerGarageSalesSearchParams = Promise<{
  paid?: string;
  created?: string;
  payment?: string;
  saleId?: string;
  session_id?: string;
}>;

function sellerStatusMessage(status: string, paymentStatus: string) {
  if (status === 'APPROVED' && paymentStatus === 'PAID') {
    return 'Your listing is active and visible to buyers.';
  }
  if (paymentStatus === 'PENDING') {
    return 'Payment is still processing. Your listing stays hidden until payment is confirmed.';
  }
  if (paymentStatus === 'FAILED') {
    return 'Payment failed. Repost and pay again to publish this listing.';
  }
  if (status === 'PENDING') {
    return 'Your listing is pending review.';
  }
  if (status === 'REJECTED') {
    return 'Your listing was rejected. Open it to review details and update.';
  }
  if (status === 'EXPIRED') {
    return 'Your listing has expired. Repost to make it active again.';
  }
  return 'This listing is not visible publicly right now.';
}

export default async function SellerGarageSalesPage({
  searchParams,
}: {
  searchParams: SellerGarageSalesSearchParams;
}) {
  const { sellerId } = await requireSeller();
  const sp = await searchParams;
  if (sp.paid === '1' && sp.saleId && sp.session_id) {
    const syncResult = await syncGarageSaleCheckoutSessionForSeller({
      checkoutSessionId: sp.session_id,
      saleId: sp.saleId,
      sellerId,
    });
    if (!syncResult.synced && syncResult.reason !== 'already_paid') {
      logWarn('Seller garage sale payment sync did not finalize', {
        tag: 'seller/garage-sales',
        action: 'syncGarageSaleCheckoutSessionForSeller',
        saleId: sp.saleId,
        reason: syncResult.reason ?? 'unknown',
      });
    }
    if (syncResult.synced || syncResult.reason === 'already_paid') {
      redirect(`/seller/garage-sales?paid=1&saleId=${encodeURIComponent(sp.saleId)}`);
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
      startDate: true,
      endDate: true,
      totalPaidCents: true,
    },
  });

  const focusedSale = sp.saleId ? sales.find((sale) => sale.id === sp.saleId) : null;

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
        <div className="card border-green-200 bg-green-50 p-4 text-sm text-green-900">
          Payment completed. {focusedSale ? sellerStatusMessage(focusedSale.status, focusedSale.paymentStatus) : 'Your listing appears below.'}
        </div>
      )}

      {sales.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-slate-600">You haven&apos;t posted any garage sales yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => (
            <div key={sale.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{sale.title}</p>
                  <p className="text-sm text-slate-500">{sale.city}, {sale.state}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {sale.startDate.toLocaleDateString('en-US')} → {sale.endDate.toLocaleDateString('en-US')} · ${(sale.totalPaidCents / 100).toFixed(2)}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">
                    {sellerStatusMessage(sale.status, sale.paymentStatus)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <span className={`badge ${STATUS_BADGE[sale.status] ?? 'badge-slate'}`}>{sale.status}</span>
                    <span className={`badge ${sale.paymentStatus === 'PAID' ? 'badge-green' : sale.paymentStatus === 'PENDING' ? 'badge-yellow' : 'badge-red'}`}>
                      {sale.paymentStatus}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/garage-sales/${sale.id}`} className="btn-outline text-xs">Open</Link>
                    <Link href={`/garage-sales/${sale.id}/edit`} className="btn-outline text-xs">Manage</Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
