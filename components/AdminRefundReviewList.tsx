'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dollars } from '@/lib/money';
import type { AdminRefundListItem } from '@/lib/admin-refunds';
import { REFUND_STATUS_LABELS, refundStatusBadge } from '@/lib/refunds';

type RefundAction = 'approve' | 'reject' | 'resolve';
type RefundResponse = {
  success: boolean;
  refund: Pick<AdminRefundListItem, 'id' | 'status' | 'approvedAmountCents' | 'adminNotes' | 'stripeRefundId' | 'resolvedAt'>;
  error?: string;
};

function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 10)}…` : value;
}

function getEffectiveAmount(request: AdminRefundListItem): number {
  return request.approvedAmountCents ?? request.requestedAmountCents;
}

function isClosedRefund(request: AdminRefundListItem): boolean {
  // `resolvedAt` is set by "Mark as resolved" for non-refunded outcomes, so it should also lock actions.
  return request.status === 'DENIED' || request.status === 'REFUNDED' || Boolean(request.resolvedAt);
}

export default function AdminRefundReviewList({
  initialRefundRequests,
  fetchFailed,
}: {
  initialRefundRequests: AdminRefundListItem[];
  fetchFailed: boolean;
}) {
  const router = useRouter();
  const [refundRequests, setRefundRequests] = useState(initialRefundRequests);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function runAction(refundId: string, action: RefundAction) {
    if (submittingKey) return;
    const note = (notes[refundId] ?? '').trim();
    const key = `${refundId}:${action}`;
    setSubmittingKey(key);
    setError('');

    try {
      const res = await fetch(`/api/admin/refunds/${refundId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note || undefined }),
      });

      let data: RefundResponse | { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok || !('success' in data) || !data.success) {
        setError(data.error ?? 'Unable to update refund request.');
        return;
      }

      setRefundRequests((current) => current.map((request) => (
        request.id === refundId
          ? {
              ...request,
              status: data.refund.status,
              approvedAmountCents: data.refund.approvedAmountCents,
              adminNotes: data.refund.adminNotes,
              stripeRefundId: data.refund.stripeRefundId,
              resolvedAt: data.refund.resolvedAt,
            }
          : request
      )));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmittingKey(null);
    }
  }

  const isBusy = (refundId: string, action: RefundAction) => submittingKey === `${refundId}:${action}`;

  if (refundRequests.length === 0) {
    return (
      <div className="space-y-3">
        {fetchFailed && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Refund data could not be loaded. Showing an empty fallback.
            <button
              type="button"
              className="ml-3 underline"
              onClick={() => router.refresh()}
            >
              Retry
            </button>
          </div>
        )}
        <div className="card p-6 text-sm text-slate-500">No refund requests yet.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fetchFailed && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Refund data could not be fully loaded. Please retry.
          <button type="button" className="ml-3 underline" onClick={() => router.refresh()}>
            Retry
          </button>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="md:hidden space-y-3">
        {refundRequests.map((request) => {
          const amount = getEffectiveAmount(request);
          const closed = isClosedRefund(request);
          const missingIntent = !request.stripePaymentIntentId;

          return (
            <div key={request.id} className="card p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-mono text-slate-500">{shortId(request.id)}</p>
                <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
              </div>
              <p className="text-sm"><span className="font-semibold">Order:</span> {shortId(request.orderId)}</p>
              <p className="text-sm"><span className="font-semibold">Buyer:</span> {request.buyer}</p>
              <p className="text-sm"><span className="font-semibold">Seller:</span> {request.seller}</p>
              <p className="text-sm"><span className="font-semibold">Amount:</span> {dollars(amount)}</p>
              <p className="text-sm"><span className="font-semibold">Reason:</span> {request.reason}</p>
              <p className="text-sm"><span className="font-semibold">Payment intent:</span> {request.stripePaymentIntentId ?? '—'}</p>
              <p className="text-xs text-slate-500">{new Date(request.createdAt).toLocaleString()}</p>

              <textarea
                className="input h-20 resize-none text-sm"
                maxLength={2000}
                placeholder="Admin note (optional)"
                value={notes[request.id] ?? ''}
                onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
              />

              <div className="flex flex-wrap gap-2">
                <Link href={`/orders/${request.orderId}`} className="btn-outline text-xs py-1 px-2">View</Link>
                {!closed && (
                  <>
                    <button
                      type="button"
                      className="btn-primary text-xs py-1 px-2"
                      disabled={isBusy(request.id, 'approve') || missingIntent}
                      onClick={() => runAction(request.id, 'approve')}
                    >
                      Approve refund
                    </button>
                    <button
                      type="button"
                      className="btn-outline text-xs py-1 px-2"
                      disabled={isBusy(request.id, 'reject')}
                      onClick={() => runAction(request.id, 'reject')}
                    >
                      Reject refund
                    </button>
                    <button
                      type="button"
                      className="btn-outline text-xs py-1 px-2"
                      disabled={isBusy(request.id, 'resolve')}
                      onClick={() => runAction(request.id, 'resolve')}
                    >
                      Mark as resolved
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-3 text-left">Refund ID</th>
              <th className="px-3 py-3 text-left">Order ID</th>
              <th className="px-3 py-3 text-left">Buyer</th>
              <th className="px-3 py-3 text-left">Seller</th>
              <th className="px-3 py-3 text-left">Amount</th>
              <th className="px-3 py-3 text-left">Reason</th>
              <th className="px-3 py-3 text-left">Status</th>
              <th className="px-3 py-3 text-left">Stripe payment intent</th>
              <th className="px-3 py-3 text-left">Created</th>
              <th className="px-3 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {refundRequests.map((request) => {
              const amount = getEffectiveAmount(request);
              const closed = isClosedRefund(request);
              const missingIntent = !request.stripePaymentIntentId;

              return (
                <tr key={request.id} className="align-top">
                  <td className="px-3 py-3 font-mono text-xs text-slate-600" title={request.id}>{shortId(request.id)}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600" title={request.orderId}>{shortId(request.orderId)}</td>
                  <td className="px-3 py-3">{request.buyer}</td>
                  <td className="px-3 py-3">{request.seller}</td>
                  <td className="px-3 py-3">{dollars(amount)}</td>
                  <td className="px-3 py-3 max-w-56">
                    <p>{request.reason}</p>
                    {request.details && <p className="text-xs text-slate-500">{request.details}</p>}
                    {request.adminNotes && <p className="text-xs text-slate-500">Note: {request.adminNotes}</p>}
                    {request.stripeRefundId && <p className="text-xs text-green-700">Stripe refund: {request.stripeRefundId}</p>}
                    <textarea
                      className="input mt-2 h-20 resize-none text-xs"
                      maxLength={2000}
                      placeholder="Admin note (optional)"
                      value={notes[request.id] ?? ''}
                      onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600" title={request.stripePaymentIntentId ?? ''}>
                    {request.stripePaymentIntentId ? shortId(request.stripePaymentIntentId) : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-500">{new Date(request.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/orders/${request.orderId}`} className="btn-outline text-xs py-1 px-2">View</Link>
                      {!closed && (
                        <>
                          <button
                            type="button"
                            className="btn-primary text-xs py-1 px-2"
                            disabled={isBusy(request.id, 'approve') || missingIntent}
                            onClick={() => runAction(request.id, 'approve')}
                          >
                            Approve refund
                          </button>
                          <button
                            type="button"
                            className="btn-outline text-xs py-1 px-2"
                            disabled={isBusy(request.id, 'reject')}
                            onClick={() => runAction(request.id, 'reject')}
                          >
                            Reject refund
                          </button>
                          <button
                            type="button"
                            className="btn-outline text-xs py-1 px-2"
                            disabled={isBusy(request.id, 'resolve')}
                            onClick={() => runAction(request.id, 'resolve')}
                          >
                            Mark as resolved
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
