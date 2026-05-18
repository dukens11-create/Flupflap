'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdminRefundDashboardItem } from '@/lib/admin-refunds';
import { dollars } from '@/lib/money';
import { REFUND_STATUS_LABELS, refundStatusBadge } from '@/lib/refunds';

type RefundAction = 'approve' | 'reject' | 'resolve';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getPersonLabel(person: { name: string | null; email: string }) {
  return person.name ?? person.email;
}

function getSellerLabels(refundRequest: AdminRefundDashboardItem) {
  return Array.from(
    new Map(
      refundRequest.order.items.map((item) => [item.product.seller.id, item.product.seller]),
    ).values(),
  ).map((seller) => getPersonLabel(seller));
}

function isRefundResolved(refundRequest: AdminRefundDashboardItem) {
  return Boolean(refundRequest.resolvedAt) || refundRequest.status === 'DENIED' || refundRequest.status === 'REFUNDED';
}

export default function AdminRefundReviewList({ initialRefundRequests }: { initialRefundRequests: AdminRefundDashboardItem[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [apiError, setApiError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [retryAction, setRetryAction] = useState<{ refundRequestId: string; action: RefundAction } | null>(null);

  async function submitRefundAction(refundRequestId: string, action: RefundAction) {
    if (submittingId) return;
    setSubmittingId(`${refundRequestId}:${action}`);
    setApiError('');
    setValidationError('');
    setSuccessMessage('');
    setRetryAction({ refundRequestId, action });

    const body: Record<string, unknown> = {};
    const note = (notes[refundRequestId] ?? '').trim();
    if (note) {
      body.adminNotes = note;
    }

    if (action === 'approve') {
      const amountRaw = (amounts[refundRequestId] ?? '').trim();
      const approvedAmountCents = amountRaw ? Math.round(Number.parseFloat(amountRaw) * 100) : undefined;

      if (amountRaw && (!Number.isFinite(approvedAmountCents ?? NaN) || (approvedAmountCents ?? 0) <= 0)) {
        setSubmittingId(null);
        setValidationError('Approved amount must be a positive USD value.');
        return;
      }

      if (approvedAmountCents) {
        body.approvedAmountCents = approvedAmountCents;
      }
    }

    try {
      const res = await fetch(`/api/admin/refunds/${refundRequestId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiError((data as { error?: string }).error ?? 'Unable to update refund request.');
        return;
      }

      setRetryAction(null);
      setSuccessMessage(
        action === 'approve'
          ? 'Refund approved successfully.'
          : action === 'reject'
            ? 'Refund rejected successfully.'
            : 'Refund request marked as resolved.',
      );
      router.refresh();
    } catch {
      setApiError('Unable to reach the refunds API. Please try again.');
    } finally {
      setSubmittingId(null);
    }
  }

  function renderActionControls(request: AdminRefundDashboardItem) {
    const resolved = isRefundResolved(request);
    const missingPaymentIntent = !request.order.stripePaymentIntentId;
    const approving = submittingId === `${request.id}:approve`;
    const rejecting = submittingId === `${request.id}:reject`;
    const resolving = submittingId === `${request.id}:resolve`;
    const amountPlaceholder = ((request.approvedAmountCents ?? request.requestedAmountCents) / 100).toFixed(2);

    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <div>
            <label className="label">Approved amount (USD, optional)</label>
            <input
              className="input"
              inputMode="decimal"
              value={amounts[request.id] ?? ''}
              onChange={(event) => setAmounts((prev) => ({ ...prev, [request.id]: event.target.value }))}
              placeholder={amountPlaceholder}
              disabled={resolved}
            />
            <p className="mt-1 text-xs text-slate-500">Leave blank to approve the requested amount.</p>
          </div>
          <div>
            <label className="label">Admin note (optional)</label>
            <textarea
              className="input h-20 resize-none"
              maxLength={2000}
              value={notes[request.id] ?? request.adminNotes ?? ''}
              onChange={(event) => setNotes((prev) => ({ ...prev, [request.id]: event.target.value }))}
              placeholder="Review notes visible on the refund timeline."
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/orders/${request.order.id}`} className="btn-outline text-sm">
            View
          </Link>
          <button
            type="button"
            className="btn-primary text-sm disabled:opacity-60"
            disabled={resolved || missingPaymentIntent || approving}
            onClick={() => submitRefundAction(request.id, 'approve')}
          >
            {approving ? 'Approving…' : 'Approve refund'}
          </button>
          <button
            type="button"
            className="btn-outline text-sm disabled:opacity-60"
            disabled={resolved || rejecting}
            onClick={() => submitRefundAction(request.id, 'reject')}
          >
            {rejecting ? 'Rejecting…' : 'Reject refund'}
          </button>
          <button
            type="button"
            className="btn-outline text-sm disabled:opacity-60"
            disabled={resolved || resolving}
            onClick={() => submitRefundAction(request.id, 'resolve')}
          >
            {resolving ? 'Resolving…' : 'Mark as resolved'}
          </button>
        </div>

        {missingPaymentIntent && !resolved && (
          <p className="text-xs text-amber-700">No Stripe payment intent is available for this order, so it cannot be refunded automatically.</p>
        )}
        <p className="text-xs text-amber-700">
          Payout reversal for Stripe Connect seller transfers is currently a manual follow-up step after refund approval.
        </p>
      </div>
    );
  }

  if (initialRefundRequests.length === 0) {
    return <div className="card p-6 text-sm text-slate-500">No refund requests yet.</div>;
  }

  return (
    <div className="space-y-4">
      {validationError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{validationError}</div>
      )}
      {apiError && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{apiError}</span>
          {retryAction && (
            <button
              type="button"
              className="btn-outline text-sm"
              onClick={() => submitRefundAction(retryAction.refundRequestId, retryAction.action)}
            >
              Try again
            </button>
          )}
        </div>
      )}
      {successMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{successMessage}</div>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Refund requests</h2>
              <p className="text-sm text-slate-500">Review, refund, reject, or manually resolve marketplace refund requests.</p>
            </div>
            <p className="text-sm text-slate-500">{initialRefundRequests.length} request{initialRefundRequests.length === 1 ? '' : 's'}</p>
          </div>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Refund ID</th>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Seller</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Stripe payment intent</th>
                <th className="px-4 py-3">Created date</th>
                <th className="px-4 py-3">Action buttons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {initialRefundRequests.map((request) => {
                const sellers = getSellerLabels(request);
                const resolved = isRefundResolved(request);

                return (
                  <tr key={request.id}>
                    <td className="px-4 py-4 font-mono text-xs text-slate-600 break-all">{request.id}</td>
                    <td className="px-4 py-4">
                      <Link href={`/orders/${request.order.id}`} className="font-mono text-xs text-blue-600 hover:text-blue-700 break-all">
                        {request.order.id}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">{getPersonLabel(request.order.buyer)}</p>
                        <p className="text-xs text-slate-500 break-all">{request.order.buyer.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{sellers.length > 0 ? sellers.join(', ') : '—'}</td>
                    <td className="px-4 py-4 text-slate-700">
                      <div className="space-y-1">
                        <p>{dollars(request.requestedAmountCents)}</p>
                        {request.approvedAmountCents !== null && (
                          <p className="text-xs text-slate-500">Approved {dollars(request.approvedAmountCents)}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">{request.reason}</p>
                        {request.details && <p className="text-xs text-slate-500">{request.details}</p>}
                        {request.sellerResponse && <p className="text-xs text-slate-500">Seller: {request.sellerResponse}</p>}
                        {request.adminNotes && <p className="text-xs text-slate-500">Admin: {request.adminNotes}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-2">
                        <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
                        {resolved && <p className="text-xs text-slate-500">Resolved</p>}
                        {request.stripeRefundId && (
                          <p className="text-xs break-all text-green-700">Refund {request.stripeRefundId}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-600 break-all">{request.order.stripePaymentIntentId ?? '—'}</td>
                    <td className="px-4 py-4 text-slate-700">
                      <div className="space-y-1">
                        <p>{formatDate(request.createdAt)}</p>
                        {request.resolvedAt && <p className="text-xs text-slate-500">Resolved {formatDate(request.resolvedAt)}</p>}
                      </div>
                    </td>
                    <td className="min-w-[22rem] px-4 py-4">{renderActionControls(request)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-4 p-4 lg:hidden">
          {initialRefundRequests.map((request) => {
            const sellers = getSellerLabels(request);
            const resolved = isRefundResolved(request);

            return (
              <div key={request.id} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-mono text-slate-400 break-all">{request.id}</p>
                    <Link href={`/orders/${request.order.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700 break-all">
                      Order {request.order.id}
                    </Link>
                  </div>
                  <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-700">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buyer</p>
                    <p>{getPersonLabel(request.order.buyer)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seller</p>
                    <p>{sellers.length > 0 ? sellers.join(', ') : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</p>
                    <p>{dollars(request.requestedAmountCents)}</p>
                    {request.approvedAmountCents !== null && (
                      <p className="text-xs text-slate-500">Approved {dollars(request.approvedAmountCents)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</p>
                    <p>{request.reason}</p>
                    {request.details && <p className="mt-1 text-xs text-slate-500">{request.details}</p>}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stripe payment intent</p>
                    <p className="font-mono text-xs break-all">{request.order.stripePaymentIntentId ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created date</p>
                    <p>{formatDate(request.createdAt)}</p>
                    {resolved && request.resolvedAt && (
                      <p className="text-xs text-slate-500">Resolved {formatDate(request.resolvedAt)}</p>
                    )}
                  </div>
                  {request.sellerResponse && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seller response</p>
                      <p>{request.sellerResponse}</p>
                    </div>
                  )}
                  {request.adminNotes && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin note</p>
                      <p>{request.adminNotes}</p>
                    </div>
                  )}
                  {request.stripeRefundId && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stripe refund</p>
                      <p className="font-mono text-xs break-all text-green-700">{request.stripeRefundId}</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  {renderActionControls(request)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
