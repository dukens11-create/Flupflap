'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dollars } from '@/lib/money';
import { REFUND_STATUS_LABELS, refundStatusBadge } from '@/lib/refunds';
import type { AdminRefundRecord } from '@/lib/admin-refunds';

type RefundAction = 'approve' | 'reject' | 'resolve';

type RetryAction = {
  refundRequestId: string;
  action: RefundAction;
};

type RefundActionResponse = {
  refund?: AdminRefundRecord;
  error?: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function displayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

export default function AdminRefundReviewList({
  initialRefundRequests,
  allowEmptyState = true,
}: {
  initialRefundRequests: AdminRefundRecord[];
  allowEmptyState?: boolean;
}) {
  const router = useRouter();
  const [refundRequests, setRefundRequests] = useState(initialRefundRequests);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null);

  const refundCountLabel = useMemo(
    () => `${refundRequests.length} request${refundRequests.length === 1 ? '' : 's'}`,
    [refundRequests.length],
  );

  async function submitAction(refundRequestId: string, action: RefundAction) {
    if (submittingId) return;

    const amountRaw = (amounts[refundRequestId] ?? '').trim();
    const approvedAmountCents = amountRaw ? Math.round(Number.parseFloat(amountRaw) * 100) : undefined;

    if (amountRaw && (!Number.isFinite(approvedAmountCents ?? NaN) || (approvedAmountCents ?? 0) <= 0)) {
      setActionError('The approved amount must be a positive dollar value.');
      setRetryAction(null);
      return;
    }

    setSubmittingId(refundRequestId);
    setActionError('');
    setRetryAction(null);

    try {
      const res = await fetch(`/api/admin/refunds/${refundRequestId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminNote: notes[refundRequestId] || undefined,
          approvedAmountCents,
        }),
      });

      let data: RefundActionResponse = {};
      try {
        data = await res.json() as RefundActionResponse;
      } catch (error) {
        console.error('[admin/refunds] Failed to parse action response.', error);
      }
      if (!res.ok) {
        setActionError(data.error ?? 'Unable to update refund request.');
        setRetryAction({ refundRequestId, action });
        return;
      }
      if (!data.refund) {
        setActionError('Unable to complete the refund action. Please try again.');
        setRetryAction({ refundRequestId, action });
        return;
      }
      const updatedRefund = data.refund;

      setRefundRequests((current) => current.map((request) => (
        request.id === refundRequestId ? updatedRefund : request
      )));
      router.refresh();
    } catch {
      setActionError('Network error: Unable to connect to the server. Please try again.');
      setRetryAction({ refundRequestId, action });
    } finally {
      setSubmittingId(null);
    }
  }

  if (refundRequests.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-slate-500">
        {allowEmptyState ? 'No refund requests yet.' : 'Unable to display refund requests.'}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Refund dashboard</h2>
          <p className="text-sm text-slate-500">{refundCountLabel}</p>
        </div>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{actionError}</span>
            {retryAction && (
              <button
                type="button"
                className="btn-outline text-sm"
                onClick={() => submitAction(retryAction.refundRequestId, retryAction.action)}
                disabled={submittingId === retryAction.refundRequestId}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      <div className="hidden md:block card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Refund ID</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Order ID</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Buyer</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Seller</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Stripe payment intent</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Created</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {refundRequests.map((request) => {
                const isExpanded = expandedId === request.id;
                const isResolved = request.status === 'DENIED' || request.status === 'REFUNDED';
                const disableApprove = !request.stripePaymentIntentId || isResolved;
                const currentAmount = request.approvedAmountCents ?? request.requestedAmountCents;

                return (
                  <FragmentRow
                    key={request.id}
                    expanded={isExpanded}
                    summary={(
                      <tr className="align-top transition-colors hover:bg-slate-50">
                        <td className="px-3 py-3 font-mono text-xs text-slate-500">{request.id.slice(-8).toUpperCase()}</td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-500">{request.orderId.slice(-8).toUpperCase()}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">{displayName(request.buyer)}</p>
                          <p className="text-xs text-slate-500">{request.buyer.email}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">{displayName(request.seller)}</p>
                          <p className="text-xs text-slate-500">{request.seller.email}</p>
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-slate-900">{dollars(currentAmount)}</td>
                        <td className="px-3 py-3 text-slate-700">{request.reason}</td>
                        <td className="px-3 py-3">
                          <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs text-slate-500">
                            {request.stripePaymentIntentId ?? 'Not available'}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-500">{formatDate(request.createdAt)}</td>
                        <td className="px-3 py-3">
                          <ActionButtons
                            isExpanded={isExpanded}
                            onView={() => setExpandedId(isExpanded ? null : request.id)}
                            onApprove={() => submitAction(request.id, 'approve')}
                            onReject={() => submitAction(request.id, 'reject')}
                            onResolve={() => submitAction(request.id, 'resolve')}
                            disableApprove={disableApprove}
                            disableReject={isResolved}
                            disableResolve={isResolved}
                            disabled={submittingId === request.id}
                          />
                        </td>
                      </tr>
                    )}
                    details={isExpanded ? (
                      <tr className="bg-slate-50">
                        <td colSpan={10} className="px-4 py-4">
                          <RefundDetails
                            request={request}
                            amountValue={amounts[request.id] ?? ''}
                            noteValue={notes[request.id] ?? ''}
                            onAmountChange={(value) => setAmounts((current) => ({ ...current, [request.id]: value }))}
                            onNoteChange={(value) => setNotes((current) => ({ ...current, [request.id]: value }))}
                          />
                        </td>
                      </tr>
                    ) : null}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {refundRequests.map((request) => {
          const isExpanded = expandedId === request.id;
          const isResolved = request.status === 'DENIED' || request.status === 'REFUNDED';
          const disableApprove = !request.stripePaymentIntentId || isResolved;
          const currentAmount = request.approvedAmountCents ?? request.requestedAmountCents;

          return (
            <div key={request.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-slate-400">Refund #{request.id.slice(-8).toUpperCase()}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">Order #{request.orderId.slice(-8).toUpperCase()}</p>
                  <p className="text-xs text-slate-500">{formatDate(request.createdAt)}</p>
                </div>
                <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-slate-700">
                <p><span className="font-semibold text-slate-900">Buyer:</span> {displayName(request.buyer)}</p>
                <p><span className="font-semibold text-slate-900">Seller:</span> {displayName(request.seller)}</p>
                <p><span className="font-semibold text-slate-900">Amount:</span> {dollars(currentAmount)}</p>
                <p><span className="font-semibold text-slate-900">Reason:</span> {request.reason}</p>
                <p><span className="font-semibold text-slate-900">Payment intent:</span> <span className="font-mono text-xs">{request.stripePaymentIntentId ?? 'Not available'}</span></p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButtons
                  isExpanded={isExpanded}
                  onView={() => setExpandedId(isExpanded ? null : request.id)}
                  onApprove={() => submitAction(request.id, 'approve')}
                  onReject={() => submitAction(request.id, 'reject')}
                  onResolve={() => submitAction(request.id, 'resolve')}
                  disableApprove={disableApprove}
                  disableReject={isResolved}
                  disableResolve={isResolved}
                  disabled={submittingId === request.id}
                />
              </div>

              {isExpanded && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <RefundDetails
                    request={request}
                    amountValue={amounts[request.id] ?? ''}
                    noteValue={notes[request.id] ?? ''}
                    onAmountChange={(value) => setAmounts((current) => ({ ...current, [request.id]: value }))}
                    onNoteChange={(value) => setNotes((current) => ({ ...current, [request.id]: value }))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FragmentRow({
  expanded,
  summary,
  details,
}: {
  expanded: boolean;
  summary: ReactNode;
  details: ReactNode;
}) {
  return (
    <>
      {summary}
      {expanded ? details : null}
    </>
  );
}

function RefundDetails({
  request,
  amountValue,
  noteValue,
  onAmountChange,
  onNoteChange,
}: {
  request: AdminRefundRecord;
  amountValue: string;
  noteValue: string;
  onAmountChange: (value: string) => void;
  onNoteChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-2 text-sm text-slate-700">
        <p><span className="font-semibold text-slate-900">Reason:</span> {request.reason}</p>
        {request.details && <p><span className="font-semibold text-slate-900">Details:</span> {request.details}</p>}
        <p><span className="font-semibold text-slate-900">Order status:</span> {request.orderStatus}</p>
        <p><span className="font-semibold text-slate-900">Requested amount:</span> {dollars(request.requestedAmountCents)}</p>
        {request.approvedAmountCents !== null && (
          <p><span className="font-semibold text-slate-900">Approved amount:</span> {dollars(request.approvedAmountCents)}</p>
        )}
        {request.sellerResponse && <p><span className="font-semibold text-slate-900">Seller response:</span> {request.sellerResponse}</p>}
        {request.adminNotes && <p><span className="font-semibold text-slate-900">Admin note:</span> {request.adminNotes}</p>}
        {request.stripeRefundId && <p><span className="font-semibold text-slate-900">Stripe refund:</span> <span className="font-mono text-xs">{request.stripeRefundId}</span></p>}
        {request.resolvedAt && <p><span className="font-semibold text-slate-900">Resolved:</span> {formatDate(request.resolvedAt)}</p>}
        <div className="pt-2">
          <Link href={`/orders/${request.orderId}`} className="btn-outline text-sm">View order</Link>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <label className="label">Amount (USD)</label>
          <input
            className="input"
            inputMode="decimal"
            value={amountValue}
            onChange={(event) => onAmountChange(event.target.value)}
            placeholder={(request.requestedAmountCents / 100).toFixed(2)}
          />
          <p className="mt-1 text-xs text-slate-500">Leave blank to use the requested amount.</p>
        </div>
        <div>
          <label className="label">Admin note</label>
          <textarea
            className="input h-24 resize-none"
            maxLength={2000}
            value={noteValue}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Add context for the buyer and your admin team."
          />
        </div>
        {!request.stripePaymentIntentId && request.status !== 'DENIED' && request.status !== 'REFUNDED' && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            This refund has no Stripe payment intent, so use <strong>Mark as resolved</strong> for manual handling.
          </p>
        )}
      </div>
    </div>
  );
}

function ActionButtons({
  isExpanded,
  onView,
  onApprove,
  onReject,
  onResolve,
  disableApprove,
  disableReject,
  disableResolve,
  disabled,
}: {
  isExpanded: boolean;
  onView: () => void;
  onApprove: () => void;
  onReject: () => void;
  onResolve: () => void;
  disableApprove: boolean;
  disableReject: boolean;
  disableResolve: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-outline text-xs" onClick={onView}>
        {isExpanded ? 'Hide' : 'View'}
      </button>
      <button type="button" className="btn-primary text-xs" onClick={onApprove} disabled={disabled || disableApprove}>
        Approve refund
      </button>
      <button type="button" className="btn-outline text-xs" onClick={onReject} disabled={disabled || disableReject}>
        Reject refund
      </button>
      <button type="button" className="btn-outline text-xs" onClick={onResolve} disabled={disabled || disableResolve}>
        Mark as resolved
      </button>
    </div>
  );
}
