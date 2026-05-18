'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { dollars } from '@/lib/money';
import { REFUND_STATUS_LABELS, refundStatusBadge } from '@/lib/refunds';
import type { AdminRefundListItem } from '@/lib/admin-refunds';

type AdminRefundRequest = AdminRefundListItem;
type RefundAction = 'approve' | 'reject' | 'resolve';

export default function AdminRefundReviewList({
  initialRefundRequests,
  initialLoadError,
}: {
  initialRefundRequests: AdminRefundRequest[];
  initialLoadError?: boolean;
}) {
  const [refundRequests, setRefundRequests] = useState(initialRefundRequests);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const sortedRefundRequests = useMemo(
    () => [...refundRequests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [refundRequests],
  );

  async function runAction(refundRequestId: string, action: RefundAction) {
    if (pendingActionId) return;
    setPendingActionId(`${refundRequestId}:${action}`);
    setError('');

    const amountRaw = (amounts[refundRequestId] ?? '').trim();
    const approvedAmountCents = amountRaw ? Math.round(Number.parseFloat(amountRaw) * 100) : undefined;
    const approvalValidationError = validateApprovalAmount(action, amountRaw, approvedAmountCents);
    if (approvalValidationError) {
      setPendingActionId(null);
      setError(approvalValidationError);
      return;
    }

    try {
      const res = await fetch(`/api/admin/refunds/${refundRequestId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedAmountCents,
          adminNotes: notes[refundRequestId] || undefined,
        }),
      });

      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch (parseError) {
        console.warn('[admin/refunds] Failed to parse action response JSON.', parseError);
        data = {};
      }

      if (!res.ok) {
        setError((data.error as string) ?? 'Unable to update refund request.');
        return;
      }

      const updated = (data.refund as Record<string, unknown>) ?? {};
      setRefundRequests((current) => current.map((request) => (
        request.id === refundRequestId
          ? {
              ...request,
              status: (updated.status as AdminRefundRequest['status']) ?? request.status,
              approvedAmountCents: (updated.approvedAmountCents as number | null | undefined) ?? request.approvedAmountCents,
              adminNotes: (updated.adminNotes as string | null | undefined) ?? request.adminNotes,
              stripeRefundId: (updated.stripeRefundId as string | null | undefined) ?? request.stripeRefundId,
              resolvedAt: (updated.resolvedAt as string | null | undefined) ?? request.resolvedAt,
            }
          : request
      )));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPendingActionId(null);
    }
  }

  if (sortedRefundRequests.length === 0) {
    return (
      <div className="card p-6 text-sm text-slate-500">
        {initialLoadError ? 'Unable to load refunds right now.' : 'No refund requests yet.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {initialLoadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Refund data may be incomplete right now.
          <button type="button" className="ml-3 underline" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button type="button" className="ml-3 underline" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}

      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Refund ID</th>
              <th className="px-3 py-2">Order ID</th>
              <th className="px-3 py-2">Buyer</th>
              <th className="px-3 py-2">Seller</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Stripe payment intent</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRefundRequests.map((request) => (
              <RefundRow
                key={request.id}
                request={request}
                notes={notes}
                amounts={amounts}
                pendingActionId={pendingActionId}
                setNotes={setNotes}
                setAmounts={setAmounts}
                runAction={runAction}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {sortedRefundRequests.map((request) => (
          <div key={request.id} className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-mono text-slate-500">Refund {shortId(request.id)}</p>
                <p className="text-xs font-mono text-slate-400">Order {shortId(request.order.id)}</p>
              </div>
              <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
            </div>
            <p className="text-sm text-slate-700"><span className="font-semibold">Buyer:</span> {request.buyer.name ?? request.buyer.email}</p>
            <p className="text-sm text-slate-700"><span className="font-semibold">Seller:</span> {request.seller.name ?? request.seller.email}</p>
            <p className="text-sm text-slate-700"><span className="font-semibold">Amount:</span> {dollars(request.approvedAmountCents ?? request.requestedAmountCents)}</p>
            <p className="text-sm text-slate-700"><span className="font-semibold">Reason:</span> {request.reason}</p>
            <p className="text-xs text-slate-500 break-all"><span className="font-semibold">Payment intent:</span> {request.order.stripePaymentIntentId ?? '—'}</p>
            <p className="text-xs text-slate-500"><span className="font-semibold">Created:</span> {new Date(request.createdAt).toLocaleString()}</p>
            <RefundActions
              request={request}
              notes={notes}
              amounts={amounts}
              pendingActionId={pendingActionId}
              setNotes={setNotes}
              setAmounts={setAmounts}
              runAction={runAction}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function RefundRow({
  request,
  notes,
  amounts,
  pendingActionId,
  setNotes,
  setAmounts,
  runAction,
}: {
  request: AdminRefundRequest;
  notes: Record<string, string>;
  amounts: Record<string, string>;
  pendingActionId: string | null;
  setNotes: Dispatch<SetStateAction<Record<string, string>>>;
  setAmounts: Dispatch<SetStateAction<Record<string, string>>>;
  runAction: (refundRequestId: string, action: RefundAction) => Promise<void>;
}) {
  return (
    <tr className="align-top">
      <td className="px-3 py-3 font-mono text-xs text-slate-500">{shortId(request.id)}</td>
      <td className="px-3 py-3 font-mono text-xs text-slate-500">{shortId(request.order.id)}</td>
      <td className="px-3 py-3">{request.buyer.name ?? request.buyer.email}</td>
      <td className="px-3 py-3">{request.seller.name ?? request.seller.email}</td>
      <td className="px-3 py-3">{dollars(request.approvedAmountCents ?? request.requestedAmountCents)}</td>
      <td className="px-3 py-3 text-slate-600">
        <p>{request.reason}</p>
        {request.details && <p className="text-xs text-slate-500">{request.details}</p>}
      </td>
      <td className="px-3 py-3">
        <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
      </td>
      <td className="px-3 py-3 font-mono text-xs break-all text-slate-500">
        {request.order.stripePaymentIntentId ?? '—'}
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">
        {new Date(request.createdAt).toLocaleDateString()}
      </td>
      <td className="px-3 py-3">
        <RefundActions
          request={request}
          notes={notes}
          amounts={amounts}
          pendingActionId={pendingActionId}
          setNotes={setNotes}
          setAmounts={setAmounts}
          runAction={runAction}
        />
      </td>
    </tr>
  );
}

function RefundActions({
  request,
  notes,
  amounts,
  pendingActionId,
  setNotes,
  setAmounts,
  runAction,
}: {
  request: AdminRefundRequest;
  notes: Record<string, string>;
  amounts: Record<string, string>;
  pendingActionId: string | null;
  setNotes: Dispatch<SetStateAction<Record<string, string>>>;
  setAmounts: Dispatch<SetStateAction<Record<string, string>>>;
  runAction: (refundRequestId: string, action: RefundAction) => Promise<void>;
}) {
  const isResolved = Boolean(request.resolvedAt) || request.status === 'DENIED' || request.status === 'REFUNDED';
  const actionPrefix = `${request.id}:`;
  const isPending = pendingActionId?.startsWith(actionPrefix) ?? false;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Link href={`/orders/${request.order.id}`} className="btn-outline text-xs" aria-label={`View order ${request.order.id}`}>
          View order
        </Link>
        <button type="button" className="btn-primary text-xs" disabled={isPending || isResolved} onClick={() => runAction(request.id, 'approve')}>
          Approve refund
        </button>
        <button type="button" className="btn-outline text-xs" disabled={isPending || isResolved} onClick={() => runAction(request.id, 'reject')}>
          Reject refund
        </button>
        <button type="button" className="btn-outline text-xs" disabled={isPending || isResolved} onClick={() => runAction(request.id, 'resolve')}>
          Mark as resolved
        </button>
      </div>
      {!isResolved && (
        <>
          <input
            className="input h-9 text-xs"
            inputMode="decimal"
            value={amounts[request.id] ?? ''}
            onChange={(event) => setAmounts((prev) => ({ ...prev, [request.id]: event.target.value }))}
            placeholder="Approved amount (USD)"
          />
          <textarea
            className="input h-16 resize-none text-xs"
            maxLength={2000}
            value={notes[request.id] ?? ''}
            onChange={(event) => setNotes((prev) => ({ ...prev, [request.id]: event.target.value }))}
            placeholder="Admin note (optional)"
          />
        </>
      )}
    </div>
  );
}

function shortId(id: string) {
  return id.slice(-8).toUpperCase();
}

function validateApprovalAmount(action: RefundAction, amountRaw: string, approvedAmountCents: number | undefined) {
  if (action !== 'approve' || !amountRaw) return '';
  if (!Number.isFinite(approvedAmountCents ?? NaN) || (approvedAmountCents ?? 0) <= 0) {
    return 'Approved amount must be a positive USD value.';
  }
  return '';
}
