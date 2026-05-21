import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireSeller } from '@/lib/require-seller';
import SellerRefundReviewList from '@/components/SellerRefundReviewList';
import { dollars } from '@/lib/money';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Seller Refunds' };

function formatRefundHistoryStatus(status: string): string {
  if (!status) return 'Unknown';
  return status
    .split('_')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(' ');
}

export default async function SellerRefundsPage() {
  const { sellerId } = await requireSeller();

  const refundRequests = await prisma.refundRequest.findMany({
    where: { sellerId },
    include: {
      order: {
        select: {
          id: true,
          status: true,
          totalCents: true,
          buyer: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const serializableRefundRequests = refundRequests.map((request) => ({
    ...request,
    createdAt: request.createdAt.toISOString(),
  }));

  const refundHistory = await prisma.sellerRefundHistory.findMany({
    where: { sellerId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/seller" className="text-sm text-slate-500 hover:text-blue-600">← Back to seller dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">Refunds</h1>
        <p className="text-sm text-slate-500">
          Review buyer refund requests and provide your response for admin review.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Refund history</h2>
        {refundHistory.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">No refund history yet.</div>
        ) : (
          <div className="space-y-3">
            {refundHistory.map((entry) => (
              <div key={entry.id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm text-slate-700">
                    {(() => {
                      const heading = entry.orderId
                        ? `Order #${entry.orderId.slice(-8).toUpperCase()}`
                        : entry.saleId
                          ? `Garage sale #${entry.saleId.slice(-8).toUpperCase()}`
                          : entry.sourceLabel
                            ? entry.sourceLabel
                            : 'Refund';
                      return <p className="font-semibold">{heading}</p>;
                    })()}
                    <p className="text-xs text-slate-500">
                      {entry.sourceLabel ?? entry.refundType}
                    </p>
                  </div>
                  <span className="badge badge-green">{formatRefundHistoryStatus(entry.status)}</span>
                </div>
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">Amount:</span>{' '}
                  {entry.amountCents !== null
                    ? `${dollars(entry.amountCents)}${entry.currency ? ` ${entry.currency}` : ''}`
                    : 'Unknown'}
                </p>
                <p className="text-xs text-slate-500">
                  {entry.reason ? `Reason: ${entry.reason} · ` : null}
                  Recorded {entry.createdAt.toLocaleString()}
                  {entry.stripeRefundId ? ` · Stripe refund ${entry.stripeRefundId}` : null}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Refund requests</h2>
        <p className="text-sm text-slate-500">
          Review buyer refund requests and provide your response for admin review.
        </p>
        <SellerRefundReviewList initialRefundRequests={serializableRefundRequests} />
      </section>
    </main>
  );
}
