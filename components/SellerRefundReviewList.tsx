'use client';

import { useState } from 'react';
import { dollars } from '@/lib/money';
import { REFUND_STATUS_LABELS, refundStatusBadge } from '@/lib/refunds';

type SellerRefundRequest = {
  id: string;
  status: 'REQUESTED' | 'SELLER_REVIEW' | 'APPROVED' | 'DENIED' | 'REFUNDED';
  reason: string;
  details: string | null;
  requestedAmountCents: number;
  approvedAmountCents: number | null;
  sellerResponse: string | null;
  adminNotes: string | null;
  createdAt: string;
  order: {
    id: string;
    status: string;
    totalCents: number;
    buyer: { name: string | null; email: string };
  };
};

export default function SellerRefundReviewList({ initialRefundRequests }: { initialRefundRequests: SellerRefundRequest[] }) {
  const [refundRequests, setRefundRequests] = useState(initialRefundRequests);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function submitResponse(refundRequestId: string, action: 'accept' | 'dispute') {
    if (submittingId) return;
    setError('');
    setSubmittingId(refundRequestId);

    try {
      const res = await fetch(`/api/seller/refund-requests/${refundRequestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          sellerResponse: responses[refundRequestId] || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Unable to submit response.');
        return;
      }

      setRefundRequests((current) => current.map((request) => (
        request.id === refundRequestId
          ? {
              ...request,
              status: data.status,
              sellerResponse: data.sellerResponse,
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
    return <div className="card p-6 text-sm text-slate-500">No refund requests yet.</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {refundRequests.map((request) => {
        const isResolved = request.status === 'DENIED' || request.status === 'REFUNDED';
        return (
          <div key={request.id} className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-400 font-mono">Order #{request.order.id.slice(-8).toUpperCase()}</p>
                <p className="text-sm text-slate-600">Buyer: {request.order.buyer.name ?? request.order.buyer.email}</p>
              </div>
              <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
            </div>

            <p className="text-sm text-slate-700"><span className="font-semibold">Reason:</span> {request.reason}</p>
            {request.details && (
              <p className="text-sm text-slate-700"><span className="font-semibold">Details:</span> {request.details}</p>
            )}
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Requested amount:</span> {dollars(request.requestedAmountCents)}
              {request.approvedAmountCents !== null && (
                <> · <span className="font-semibold">Approved amount:</span> {dollars(request.approvedAmountCents)}</>
              )}
            </p>
            {request.sellerResponse && (
              <p className="text-sm text-slate-700"><span className="font-semibold">Your response:</span> {request.sellerResponse}</p>
            )}
            {request.adminNotes && (
              <p className="text-sm text-slate-700"><span className="font-semibold">Admin notes:</span> {request.adminNotes}</p>
            )}

            {!isResolved && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="label">Respond for admin review</label>
                <textarea
                  className="input h-20 resize-none"
                  maxLength={2000}
                  value={responses[request.id] ?? ''}
                  onChange={(event) => setResponses((prev) => ({ ...prev, [request.id]: event.target.value }))}
                  placeholder="Share your side, shipping details, or resolution notes."
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    disabled={submittingId === request.id}
                    onClick={() => submitResponse(request.id, 'accept')}
                  >
                    Accept Request
                  </button>
                  <button
                    type="button"
                    className="btn-outline text-sm"
                    disabled={submittingId === request.id}
                    onClick={() => submitResponse(request.id, 'dispute')}
                  >
                    Dispute Request
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
