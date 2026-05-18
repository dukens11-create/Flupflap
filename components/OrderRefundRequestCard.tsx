'use client';

import { useMemo, useState } from 'react';
import { dollars } from '@/lib/money';

type RefundRequestSummary = {
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
  updatedAt: string;
  resolvedAt: string | null;
};

const STATUS_LABELS: Record<RefundRequestSummary['status'], string> = {
  REQUESTED: 'Requested',
  SELLER_REVIEW: 'Under seller review',
  APPROVED: 'Approved',
  DENIED: 'Denied',
  REFUNDED: 'Refunded',
};

const STATUS_BADGES: Record<RefundRequestSummary['status'], string> = {
  REQUESTED: 'badge-yellow',
  SELLER_REVIEW: 'badge-blue',
  APPROVED: 'badge-blue',
  DENIED: 'badge-red',
  REFUNDED: 'badge-green',
};

const REASONS = [
  'Item not received',
  'Item arrived damaged',
  'Item not as described',
  'Wrong item received',
  'Other',
] as const;

function isOrderRefundEligible(orderStatus: string): boolean {
  return [
    'PAID',
    'SHIPPED',
    'DELIVERED',
    'READY_FOR_PICKUP',
    'PICKED_UP',
    'PARTIALLY_REFUNDED',
  ].includes(orderStatus);
}

export default function OrderRefundRequestCard({
  orderId,
  orderStatus,
  totalCents,
  initialRefundRequest,
}: {
  orderId: string;
  orderStatus: string;
  totalCents: number;
  initialRefundRequest: RefundRequestSummary | null;
}) {
  const [refundRequest, setRefundRequest] = useState<RefundRequestSummary | null>(initialRefundRequest);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [details, setDetails] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const eligible = useMemo(
    () => !refundRequest && isOrderRefundEligible(orderStatus),
    [orderStatus, refundRequest],
  );

  async function submitRefundRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError('');

    const trimmedDetails = details.trim();
    const amountValue = requestedAmount.trim();
    const requestedAmountCents = amountValue
      ? Math.round(Number.parseFloat(amountValue) * 100)
      : undefined;

    if (amountValue && (!Number.isFinite(requestedAmountCents ?? NaN) || (requestedAmountCents ?? 0) <= 0)) {
      setSubmitting(false);
      setError('Enter a valid requested amount or leave it blank for full refund.');
      return;
    }

    try {
      const res = await fetch(`/api/orders/${orderId}/refund-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          details: trimmedDetails || undefined,
          requestedAmountCents,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Unable to submit refund request.');
        return;
      }

      setRefundRequest({
        ...data,
        createdAt: new Date(data.createdAt).toISOString(),
        updatedAt: new Date(data.updatedAt).toISOString(),
        resolvedAt: data.resolvedAt ? new Date(data.resolvedAt).toISOString() : null,
      });
      setShowForm(false);
      setRequestedAmount('');
      setDetails('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card p-5 mb-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">Refund request</h2>
        {refundRequest && (
          <span className={`badge ${STATUS_BADGES[refundRequest.status]}`}>{STATUS_LABELS[refundRequest.status]}</span>
        )}
      </div>

      {refundRequest ? (
        <div className="space-y-2 text-sm text-slate-600">
          <p><span className="font-semibold text-slate-800">Reason:</span> {refundRequest.reason}</p>
          {refundRequest.details && <p><span className="font-semibold text-slate-800">Details:</span> {refundRequest.details}</p>}
          <p>
            <span className="font-semibold text-slate-800">Requested amount:</span> {dollars(refundRequest.requestedAmountCents)}
            {refundRequest.approvedAmountCents !== null && (
              <> · <span className="font-semibold text-slate-800">Approved amount:</span> {dollars(refundRequest.approvedAmountCents)}</>
            )}
          </p>
          {refundRequest.sellerResponse && (
            <p><span className="font-semibold text-slate-800">Seller response:</span> {refundRequest.sellerResponse}</p>
          )}
          {refundRequest.adminNotes && (
            <p><span className="font-semibold text-slate-800">Admin notes:</span> {refundRequest.adminNotes}</p>
          )}
          {refundRequest.stripeRefundId && (
            <p className="text-green-700"><span className="font-semibold">Stripe refund ID:</span> {refundRequest.stripeRefundId}</p>
          )}
        </div>
      ) : eligible ? (
        <>
          <p className="text-sm text-slate-500">
            You can request a refund review for this order. If approved, the refund is returned to your original payment method.
          </p>

          {!showForm ? (
            <button
              type="button"
              className="btn-outline text-sm"
              onClick={() => setShowForm(true)}
            >
              Request Refund
            </button>
          ) : (
            <form className="space-y-3" onSubmit={submitRefundRequest}>
              <div>
                <label className="label">Reason</label>
                <select className="input" value={reason} onChange={(event) => setReason(event.target.value)} required>
                  {REASONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  className="input h-24 resize-none"
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  maxLength={2000}
                  placeholder="Describe what happened and what resolution you need."
                />
              </div>
              <div>
                <label className="label">Requested amount (USD, optional)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={requestedAmount}
                  onChange={(event) => setRequestedAmount(event.target.value)}
                  placeholder={(totalCents / 100).toFixed(2)}
                />
                <p className="mt-1 text-xs text-slate-500">Leave blank to request a full refund.</p>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary text-sm" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit request'}
                </button>
                <button
                  type="button"
                  className="btn-outline text-sm"
                  onClick={() => {
                    setShowForm(false);
                    setError('');
                  }}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-500">Refund requests are not available for this order status.</p>
      )}
    </section>
  );
}
