'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dollars } from '@/lib/money';
import { REFUND_STATUS_LABELS, refundStatusBadge } from '@/lib/refunds';

type AdminRefundRequest = {
  id: string;
  status: 'REQUESTED' | 'SELLER_REVIEW' | 'APPROVED' | 'DENIED' | 'REFUNDED';
  reason: string;
  details: string | null;
  requestedAmountCents: number;
  approvedAmountCents: number | null;
  adminNotes: string | null;
  sellerResponse: string | null;
  stripeRefundId: string | null;
  createdAt: string;
  buyer: { id: string; name: string | null; email: string };
  seller: { id: string; name: string | null; email: string };
  order: {
    id: string;
    status: string;
    totalCents: number;
    stripePaymentIntentId: string | null;
  };
};

export default function AdminRefundReviewList({
  initialRefundRequests,
  refundFetchError,
}: {
  initialRefundRequests: AdminRefundRequest[];
  refundFetchError?: boolean;
}) {
  const router = useRouter();
  const [refundRequests, setRefundRequests] = useState(initialRefundRequests);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function approveRequest(refundRequestId: string) {
    const amountRaw = (amounts[refundRequestId] ?? '').trim();
    const approvedAmountCents = amountRaw ? Math.round(Number.parseFloat(amountRaw) * 100) : undefined;

    if (amountRaw && (!Number.isFinite(approvedAmountCents ?? NaN) || (approvedAmountCents ?? 0) <= 0)) {
      setError('Approved amount must be a positive USD value.');
      return;
    }

    if (submittingKey) return;
    setSubmittingKey(`${refundRequestId}:approve`);
    setError('');

    try {
      const res = await fetch(`/api/admin/refunds/${refundRequestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedAmountCents,
          adminNotes: notes[refundRequestId] || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Unable to update refund request.');
        return;
      }

      setRefundRequests((current) => current.map((request) => (
        request.id === refundRequestId
          ? {
              ...request,
              status: data.status,
              approvedAmountCents: data.approvedAmountCents,
              adminNotes: data.adminNotes,
              stripeRefundId: data.stripeRefundId,
            }
          : request
      )));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmittingKey(null);
    }
  }

  async function rejectRequest(refundRequestId: string, markAsResolved = false) {
    if (submittingKey) return;
    setSubmittingKey(`${refundRequestId}:${markAsResolved ? 'resolve' : 'reject'}`);
    setError('');

    try {
      const note = notes[refundRequestId]?.trim();
      const res = await fetch(`/api/admin/refunds/${refundRequestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminNotes: note || (markAsResolved ? 'Marked as resolved by admin.' : undefined),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Unable to update refund request.');
        return;
      }

      setRefundRequests((current) => current.map((request) => (
        request.id === refundRequestId
          ? {
              ...request,
              status: data.status,
              adminNotes: data.adminNotes,
            }
          : request
      )));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmittingKey(null);
    }
  }

  if (refundRequests.length === 0) {
    if (refundFetchError) {
      return (
        <div className="card p-6 space-y-3">
          <p className="text-sm text-red-700">We couldn&apos;t load refund requests right now.</p>
          <button type="button" className="btn-primary text-sm" onClick={() => router.refresh()}>
            Retry
          </button>
        </div>
      );
    }
    return <div className="card p-6 text-sm text-slate-500">No refund requests yet.</div>;
  }

  return (
    <div className="space-y-4">
      {refundFetchError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-center justify-between gap-3">
          <span>Some refund data may be outdated due to a temporary fetch issue.</span>
          <button type="button" className="btn-outline text-xs py-1 px-2" onClick={() => router.refresh()}>
            Retry
          </button>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" className="btn-outline text-xs py-1 px-2" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}

      <div className="hidden md:block card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Refund ID</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Order ID</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Buyer</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Seller</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Amount</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Reason</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Stripe payment intent</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Created</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {refundRequests.map((request) => {
                const resolved = request.status === 'DENIED' || request.status === 'REFUNDED';
                return (
                  <tr key={request.id} className="border-b border-slate-50 align-top">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{request.id.slice(-8).toUpperCase()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{request.order.id.slice(-8).toUpperCase()}</td>
                    <td className="px-4 py-3 text-slate-700">{request.buyer.name ?? request.buyer.email}</td>
                    <td className="px-4 py-3 text-slate-700">{request.seller.name ?? request.seller.email}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {dollars(request.requestedAmountCents)}
                      {request.approvedAmountCents !== null && (
                        <p className="text-xs text-slate-500">Approved {dollars(request.approvedAmountCents)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-[200px]">
                      <p className="line-clamp-2">{request.reason}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 break-all">
                      {request.order.stripePaymentIntentId ?? 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(request.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 min-w-[260px] space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/orders/${request.order.id}`} className="btn-outline text-xs py-1 px-2">View</Link>
                        <button
                          type="button"
                          className="btn-primary text-xs py-1 px-2"
                          disabled={resolved || submittingKey === `${request.id}:approve`}
                          onClick={() => approveRequest(request.id)}
                        >
                          Approve refund
                        </button>
                        <button
                          type="button"
                          className="btn-outline text-xs py-1 px-2"
                          disabled={resolved || submittingKey === `${request.id}:reject`}
                          onClick={() => rejectRequest(request.id)}
                        >
                          Reject refund
                        </button>
                        <button
                          type="button"
                          className="btn-outline text-xs py-1 px-2"
                          disabled={resolved || submittingKey === `${request.id}:resolve`}
                          onClick={() => rejectRequest(request.id, true)}
                        >
                          Mark as resolved
                        </button>
                      </div>
                      {!resolved && (
                        <div className="space-y-2">
                          <label className="label">Approved amount (USD, optional)</label>
                          <input
                            className="input"
                            inputMode="decimal"
                            value={amounts[request.id] ?? ''}
                            onChange={(event) => setAmounts((prev) => ({ ...prev, [request.id]: event.target.value }))}
                            placeholder={(request.requestedAmountCents / 100).toFixed(2)}
                          />
                          <label className="label">Admin note (optional)</label>
                          <textarea
                            className="input h-16 resize-none"
                            maxLength={2000}
                            value={notes[request.id] ?? ''}
                            onChange={(event) => setNotes((prev) => ({ ...prev, [request.id]: event.target.value }))}
                            placeholder="Admin note (optional)"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="md:hidden space-y-3">
        {refundRequests.map((request) => {
          const resolved = request.status === 'DENIED' || request.status === 'REFUNDED';

          return (
            <div key={request.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-400 font-mono">Refund #{request.id.slice(-8).toUpperCase()}</p>
                  <p className="text-xs text-slate-400 font-mono">Order #{request.order.id.slice(-8).toUpperCase()}</p>
                </div>
                <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
              </div>

              <div className="text-sm text-slate-700 space-y-1">
                <p><span className="font-semibold">Buyer:</span> {request.buyer.name ?? request.buyer.email}</p>
                <p><span className="font-semibold">Seller:</span> {request.seller.name ?? request.seller.email}</p>
                <p><span className="font-semibold">Amount:</span> {dollars(request.requestedAmountCents)}</p>
                <p><span className="font-semibold">Reason:</span> {request.reason}</p>
                <p><span className="font-semibold">Stripe payment intent:</span> {request.order.stripePaymentIntentId ?? 'N/A'}</p>
                <p><span className="font-semibold">Created:</span> {new Date(request.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>

              {!resolved && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="label">Approved amount (USD, optional)</label>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={amounts[request.id] ?? ''}
                    onChange={(event) => setAmounts((prev) => ({ ...prev, [request.id]: event.target.value }))}
                    placeholder={(request.requestedAmountCents / 100).toFixed(2)}
                  />
                  <label className="label">Admin note (optional)</label>
                  <textarea
                    className="input h-20 resize-none"
                    maxLength={2000}
                    value={notes[request.id] ?? ''}
                    onChange={(event) => setNotes((prev) => ({ ...prev, [request.id]: event.target.value }))}
                    placeholder="Add internal resolution context."
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <Link href={`/orders/${request.order.id}`} className="btn-outline text-xs py-1 px-2">View</Link>
                <button
                  type="button"
                  className="btn-primary text-xs py-1 px-2"
                  disabled={resolved || submittingKey === `${request.id}:approve`}
                  onClick={() => approveRequest(request.id)}
                >
                  Approve refund
                </button>
                <button
                  type="button"
                  className="btn-outline text-xs py-1 px-2"
                  disabled={resolved || submittingKey === `${request.id}:reject`}
                  onClick={() => rejectRequest(request.id)}
                >
                  Reject refund
                </button>
                <button
                  type="button"
                  className="btn-outline text-xs py-1 px-2"
                  disabled={resolved || submittingKey === `${request.id}:resolve`}
                  onClick={() => rejectRequest(request.id, true)}
                >
                  Mark as resolved
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
