'use client';

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
  order: {
    id: string;
    status: string;
    totalCents: number;
    buyer: { id: string; name: string | null; email: string };
    items: Array<{
      id: string;
      quantity: number;
      product: { id: string; title: string; seller: { id: string; name: string | null; email: string } };
    }>;
  };
};

export default function AdminRefundReviewList({ initialRefundRequests }: { initialRefundRequests: AdminRefundRequest[] }) {
  const [refundRequests, setRefundRequests] = useState(initialRefundRequests);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function patchRequest(refundRequestId: string, action: 'approve' | 'deny') {
    if (submittingId) return;
    setSubmittingId(refundRequestId);
    setError('');

    const amountRaw = (amounts[refundRequestId] ?? '').trim();
    const approvedAmountCents = amountRaw ? Math.round(Number.parseFloat(amountRaw) * 100) : undefined;

    if (amountRaw && (!Number.isFinite(approvedAmountCents ?? NaN) || (approvedAmountCents ?? 0) <= 0)) {
      setSubmittingId(null);
      setError('Approved amount must be a positive USD value.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/refund-requests/${refundRequestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
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
      setSubmittingId(null);
    }
  }

  if (refundRequests.length === 0) {
    return <div className="card p-6 text-sm text-slate-500">No refund requests found.</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {refundRequests.map((request) => {
        const sellers = Array.from(
          new Map(
            request.order.items.map((item) => [item.product.seller.id, item.product.seller]),
          ).values(),
        );
        const resolved = request.status === 'DENIED' || request.status === 'REFUNDED';

        return (
          <div key={request.id} className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-400 font-mono">Order #{request.order.id.slice(-8).toUpperCase()}</p>
                <p className="text-sm text-slate-600">Buyer: {request.order.buyer.name ?? request.order.buyer.email}</p>
                {sellers.length > 0 && (
                  <p className="text-sm text-slate-600">
                    Seller{ sellers.length > 1 ? 's' : '' }: {sellers.map((seller) => seller.name ?? seller.email).join(', ')}
                  </p>
                ) }
              </div>
              <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
            </div>

            <div className="text-sm text-slate-700 space-y-1">
              <p><span className="font-semibold">Reason:</span> {request.reason}</p>
              {request.details && <p><span className="font-semibold">Details:</span> {request.details}</p>}
              <p>
                <span className="font-semibold">Requested amount:</span> {dollars(request.requestedAmountCents)}
                {request.approvedAmountCents !== null && (
                  <> · <span className="font-semibold">Approved amount:</span> {dollars(request.approvedAmountCents)}</>
                )}
              </p>
              {request.sellerResponse && <p><span className="font-semibold">Seller response:</span> {request.sellerResponse}</p>}
              {request.adminNotes && <p><span className="font-semibold">Admin notes:</span> {request.adminNotes}</p>}
              {request.stripeRefundId && <p className="text-green-700"><span className="font-semibold">Stripe refund:</span> {request.stripeRefundId}</p>}
            </div>

            {!resolved && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div>
                  <label className="label">Approved amount (USD, optional)</label>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={amounts[request.id] ?? ''}
                    onChange={(event) => setAmounts((prev) => ({ ...prev, [request.id]: event.target.value }))}
                    placeholder={(request.requestedAmountCents / 100).toFixed(2)}
                  />
                  <p className="mt-1 text-xs text-slate-500">Leave blank to approve the requested amount.</p>
                </div>
                <div>
                  <label className="label">Admin notes (optional)</label>
                  <textarea
                    className="input h-20 resize-none"
                    maxLength={2000}
                    value={notes[request.id] ?? ''}
                    onChange={(event) => setNotes((prev) => ({ ...prev, [request.id]: event.target.value }))}
                    placeholder="Review notes visible on the refund timeline."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    disabled={submittingId === request.id}
                    onClick={() => patchRequest(request.id, 'approve')}
                  >
                    Approve + Refund
                  </button>
                  <button
                    type="button"
                    className="btn-outline text-sm"
                    disabled={submittingId === request.id}
                    onClick={() => patchRequest(request.id, 'deny')}
                  >
                    Deny Request
                  </button>
                </div>
                <p className="text-xs text-amber-700">
                  Payout reversal for Stripe Connect seller transfers is currently a manual follow-up step after refund approval.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
