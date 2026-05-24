import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSeller } from '@/lib/require-seller';
import SellerRefundReviewList from '@/components/SellerRefundReviewList';
import { dollars } from '@/lib/money';
import { getSellerRefundsData, type SellerRefundsData } from '@/lib/seller-refunds';
import { getServerTranslations } from '@/lib/i18n/server';
import { getLocaleDateTimeFormatLocale } from '@/lib/i18n/shared';

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

function getHistoryStatusMeta(status: string): { badge: string; nextStepKey: string } {
  const normalized = status.toLowerCase();
  if (['succeeded', 'completed', 'refunded'].includes(normalized)) {
    return {
      badge: 'badge-green',
      nextStepKey: 'sellerRefunds.nextSteps.completed',
    };
  }
  if (['denied', 'rejected', 'failed', 'canceled', 'cancelled'].includes(normalized)) {
    return {
      badge: 'badge-red',
      nextStepKey: 'sellerRefunds.nextSteps.closed',
    };
  }
  return {
    badge: 'badge-blue',
    nextStepKey: 'sellerRefunds.nextSteps.adminReview',
  };
}

export default async function SellerRefundsPage() {
  const { sellerId } = await requireSeller();
  const { locale, t } = await getServerTranslations();
  const refundDateFormatter = new Intl.DateTimeFormat(getLocaleDateTimeFormatLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });

  let refundsData: SellerRefundsData;
  try {
    refundsData = await getSellerRefundsData(sellerId);
  } catch (error) {
    console.error('[seller/refunds] Failed to render seller refunds page', {
      sellerId,
      error,
    });
    refundsData = {
      refundRequests: [],
      refundHistory: [],
      refundRequestsFetchFailed: true,
      refundHistoryFetchFailed: true,
      refundHistoryFetchError: 'Refund data failed to load due to an unexpected server error.',
    };
  }

  const {
    refundRequests,
    refundHistory,
    refundRequestsFetchFailed,
    refundHistoryFetchFailed,
    refundHistoryFetchError,
  } = refundsData;

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
          {t('sellerRefunds.historyDescription')}
        </p>
        {refundHistoryFetchFailed ? (
          <div className="card p-6 text-sm text-amber-700">
            <p>Refund history could not be loaded right now.</p>
            <p className="mt-1 text-xs text-amber-800">
              {refundHistoryFetchError ?? 'A backend or network error occurred while loading refund history.'}
            </p>
          </div>
        ) : refundHistory.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">
            No refunds processed yet for your account.
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
                        Item: {(entry.order.items[0]?.product?.title?.trim() || t('sellerRefunds.itemUnavailable'))}
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
                  Recorded {refundDateFormatter.format(entry.createdAt)}
                  {entry.resolvedAt ? ` · Resolved ${refundDateFormatter.format(entry.resolvedAt)}` : ''}
                </p>
                <p className="text-xs text-slate-600">
                  <span className="font-semibold">Next step:</span> {t(getHistoryStatusMeta(entry.status).nextStepKey)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Refund Requests</h2>
        <p className="text-sm text-slate-500">
          {t('sellerRefunds.requestsDescription')}
        </p>
        {!refundRequestsFetchFailed && refundRequests.length > 0 ? (
          <p className="text-xs text-slate-500">
            {refundRequests.length === 1
              ? t('sellerRefunds.requestsSummaryOne', { date: refundDateFormatter.format(refundRequests[0].createdAt) })
              : t('sellerRefunds.requestsSummaryMany', {
                count: refundRequests.length,
                date: refundDateFormatter.format(refundRequests[0].createdAt),
              })}
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
