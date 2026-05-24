import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSeller } from '@/lib/require-seller';
import SellerRefundReviewList from '@/components/SellerRefundReviewList';
import { dollars } from '@/lib/money';
import { getSellerRefundsData } from '@/lib/seller-refunds';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Seller Refunds' };

function formatOrderLabel(orderId: string | null, saleId: string | null, sourceLabel: string | null): string {
  if (orderId) return `Order #${orderId.slice(-8).toUpperCase()}`;
  if (saleId) return `Garage sale #${saleId.slice(-8).toUpperCase()}`;
  if (sourceLabel) return sourceLabel;
  return 'Refund';
}

function formatRefundHistoryStatus(status: string): string {
  if (!status) return 'Unknown';
  return status
    .split('_')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(' ');
}

function getHistoryStatusMeta(status: string): { badge: string; nextStep: string } {
  const normalized = status.toLowerCase();
  if (['succeeded', 'completed', 'refunded'].includes(normalized)) {
    return {
      badge: 'badge-green',
      nextStep: 'Completed',
    };
  }
  if (['denied', 'rejected', 'failed', 'canceled', 'cancelled'].includes(normalized)) {
    return {
      badge: 'badge-red',
      nextStep: 'Closed',
    };
  }
  return {
    badge: 'badge-blue',
    nextStep: 'Admin review',
  };
}

export default async function SellerRefundsPage() {
  const { sellerId } = await requireSeller();
  const refundRequestDateFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
  const refundHistoryDateFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  const {
    refundRequests,
    refundHistory,
    refundRequestsFetchFailed,
    refundHistoryFetchFailed,
  } = await getSellerRefundsData(sellerId);

  const serializableRefundRequests = refundRequests.map((request) => ({
    ...request,
    createdAt: request.createdAt.toISOString(),
  }));

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/seller" className="text-sm text-slate-500 hover:text-blue-600">← Back to seller dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">Refunds</h1>
        <p className="text-sm text-slate-500">
          Review buyer refund requests and provide your response for admin review.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Refund History</h2>
        <p className="text-sm text-slate-500">
          Track processed and in-progress refunds with clear status and resolution notes.
        </p>
        {refundHistoryFetchFailed ? (
          <div className="card p-6 text-sm text-amber-700">
            Refund history could not be loaded right now. You can still review active refund requests below.
          </div>
        ) : refundHistory.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">
            No processed refunds yet. Completed refunds will appear here.
          </div>
        ) : (
          <div className="grid gap-3">
            {refundHistory.map((entry) => (
              <div key={entry.id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm text-slate-700">
                    <p className="font-semibold">{formatOrderLabel(entry.orderId, entry.saleId, entry.sourceLabel)}</p>
                    <p className="text-xs text-slate-500">
                      {entry.sourceLabel ?? entry.refundType}
                    </p>
                    {entry.order?.items?.length ? (
                      <p className="text-xs text-slate-500">
                        Item: {entry.order.items[0]?.product.title}
                        {entry.order.items.length > 1 ? ` +${entry.order.items.length - 1} more` : ''}
                      </p>
                    ) : null}
                  </div>
                  <span className={`badge ${getHistoryStatusMeta(entry.status).badge}`}>
                    {formatRefundHistoryStatus(entry.status)}
                  </span>
                </div>
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">Amount:</span>{' '}
                  {entry.amountCents !== null
                    ? `${dollars(entry.amountCents)}${entry.currency ? ` ${entry.currency}` : ''}`
                    : 'Unknown'}
                </p>
                <p className="text-xs text-slate-500">
                  {entry.reason ? `Reason: ${entry.reason} · ` : ''}
                  Recorded {refundHistoryDateFormatter.format(entry.createdAt)} UTC
                  {entry.resolvedAt ? ` · Resolved ${refundHistoryDateFormatter.format(entry.resolvedAt)} UTC` : ''}
                </p>
                <p className="text-xs text-slate-600">
                  <span className="font-semibold">Next step:</span> {getHistoryStatusMeta(entry.status).nextStep}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Refund Requests</h2>
        <p className="text-sm text-slate-500">
          Review buyer requests, approve/reject, or send context for admin review.
        </p>
        {!refundRequestsFetchFailed && refundRequests.length > 0 ? (
          <p className="text-xs text-slate-500">
            Showing {refundRequests.length} request{refundRequests.length === 1 ? '' : 's'} · last updated{' '}
            {refundRequestDateFormatter.format(refundRequests[0].createdAt)} UTC
          </p>
        ) : null}
        {refundRequestsFetchFailed ? (
          <div className="card p-6 text-sm text-amber-700">
            Refund requests could not be loaded right now. Please refresh the page to try again.
          </div>
        ) : (
          <SellerRefundReviewList initialRefundRequests={serializableRefundRequests} />
        )}
      </section>
    </main>
  );
}
