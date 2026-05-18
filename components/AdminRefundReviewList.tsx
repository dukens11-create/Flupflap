'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dollars } from '@/lib/money';
import { REFUND_STATUS_LABELS, refundStatusBadge } from '@/lib/refunds';

type AdminRefundRequest = {
  id: string;
  orderId: string;
  status: 'REQUESTED' | 'SELLER_REVIEW' | 'APPROVED' | 'DENIED' | 'REFUNDED';
  reason: string;
  details: string | null;
  requestedAmountCents: number;
  approvedAmountCents: number | null;
  adminNotes: string | null;
  sellerResponse: string | null;
  stripeRefundId: string | null;
  stripePaymentIntentId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  buyer: { id: string; name: string | null; email: string };
  seller: { id: string; name: string | null; email: string };
  order: { id: string; status: string; totalCents: number };
};

type RetryAction = {
  refundRequestId: string;
  endpoint: string;
  payload: Record<string, unknown>;
};

// Keeps the desktop table readable without forcing extreme horizontal scrolling
// on narrower laptop screens. Phone layouts switch to cards instead.
const ADMIN_REFUNDS_TABLE_MIN_WIDTH = 'min-w-[1080px]';

function formatPerson(person: { name: string | null; email: string }) {
  return person.name?.trim() || person.email;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isResolved(request: AdminRefundRequest) {
  return Boolean(request.resolvedAt) || request.status === 'DENIED' || request.status === 'REFUNDED';
}

function makeActionKey(refundRequestId: string, endpoint: string) {
  return `${refundRequestId}:${endpoint}`;
}

export default function AdminRefundReviewList({
  initialRefundRequests,
  loadError = false,
  loadErrorMessage = '',
}: {
  initialRefundRequests: AdminRefundRequest[];
  loadError?: boolean;
  loadErrorMessage?: string;
}) {
  const router = useRouter();
  const [refundRequests, setRefundRequests] = useState(initialRefundRequests);
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(
    initialRefundRequests
      .filter((request) => Boolean(request.adminNotes))
      .map((request) => [request.id, request.adminNotes ?? '']),
  ));
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null);

  function updateLocalRefundRequest(refundRequestId: string, data: Partial<AdminRefundRequest>) {
    setRefundRequests((current) => current.map((request) => (
      request.id === refundRequestId
        ? {
            ...request,
            ...data,
          }
        : request
    )));
  }

  async function postAction(refundRequestId: string, endpoint: string, payload: Record<string, unknown>) {
    const submittingId = makeActionKey(refundRequestId, endpoint);
    if (submittingKey) return;

    setSubmittingKey(submittingId);
    setActionError('');
    setRetryAction(null);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setActionError(data.error ?? 'Unable to update this refund right now.');
        setRetryAction({ refundRequestId, endpoint, payload });
        return;
      }

      updateLocalRefundRequest(refundRequestId, {
        status: data.status,
        approvedAmountCents: data.approvedAmountCents,
        adminNotes: data.adminNotes,
        stripeRefundId: data.stripeRefundId,
        resolvedAt: data.resolvedAt ?? null,
      });
    } catch {
      setActionError('API request failed. Please try again.');
      setRetryAction({ refundRequestId, endpoint, payload });
    } finally {
      setSubmittingKey(null);
    }
  }

  async function approveRefund(request: AdminRefundRequest) {
    const amountRaw = (amounts[request.id] ?? '').trim();
    const approvedAmountCents = amountRaw ? Math.round(Number.parseFloat(amountRaw) * 100) : undefined;

    if (amountRaw && (!Number.isFinite(approvedAmountCents ?? NaN) || (approvedAmountCents ?? 0) <= 0)) {
      setActionError('Approved amount must be a positive USD value.');
      setRetryAction(null);
      return;
    }

    await postAction(
      request.id,
      `/api/admin/refunds/${request.id}/approve`,
      {
        approvedAmountCents,
        adminNote: notes[request.id]?.trim() || undefined,
      },
    );
  }

  async function rejectRefund(request: AdminRefundRequest) {
    await postAction(
      request.id,
      `/api/admin/refunds/${request.id}/reject`,
      {
        adminNote: notes[request.id]?.trim() || undefined,
      },
    );
  }

  async function resolveRefund(request: AdminRefundRequest) {
    await postAction(
      request.id,
      `/api/admin/refunds/${request.id}/resolve`,
      {
        adminNote: notes[request.id]?.trim() || undefined,
      },
    );
  }

  function renderActionControls(request: AdminRefundRequest) {
    const resolved = isResolved(request);
    const canResolve = !request.resolvedAt && ['APPROVED', 'DENIED', 'REFUNDED'].includes(request.status);
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Refund amount (USD)</label>
            <input
              className="input"
              inputMode="decimal"
              value={amounts[request.id] ?? ''}
              onChange={(event) => setAmounts((prev) => ({ ...prev, [request.id]: event.target.value }))}
              placeholder={(request.requestedAmountCents / 100).toFixed(2)}
            />
            <p className="mt-1 text-xs text-slate-500">Leave blank to refund the requested amount.</p>
          </div>
          <div>
            <label className="label">Admin note</label>
            <textarea
              className="input h-24 resize-none"
              maxLength={2000}
              value={notes[request.id] ?? ''}
              onChange={(event) => setNotes((prev) => ({ ...prev, [request.id]: event.target.value }))}
              placeholder="Add an internal/admin-facing note for this refund."
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/orders/${request.orderId}`} className="btn-outline text-sm">
            View
          </Link>
          <button
            type="button"
            className="btn-primary text-sm disabled:opacity-50"
            disabled={resolved || submittingKey === makeActionKey(request.id, `/api/admin/refunds/${request.id}/approve`)}
            onClick={() => approveRefund(request)}
          >
            Approve refund
          </button>
          <button
            type="button"
            className="btn-outline text-sm disabled:opacity-50"
            disabled={resolved || submittingKey === makeActionKey(request.id, `/api/admin/refunds/${request.id}/reject`)}
            onClick={() => rejectRefund(request)}
          >
            Reject refund
          </button>
          <button
            type="button"
            className="btn-outline text-sm disabled:opacity-50"
            disabled={!canResolve || submittingKey === makeActionKey(request.id, `/api/admin/refunds/${request.id}/resolve`)}
            onClick={() => resolveRefund(request)}
          >
            Mark as resolved
          </button>
        </div>
      </div>
    );
  }

  if (refundRequests.length === 0) {
    return (
      <div className="space-y-4">
        {loadError && (
          <div className="card space-y-3 border-red-200 bg-red-50 p-5 text-sm text-red-700">
            <p>{loadErrorMessage || 'Refund data is temporarily unavailable.'}</p>
            <div>
              <button type="button" className="btn-primary text-sm" onClick={() => router.refresh()}>
                Retry
              </button>
            </div>
          </div>
        )}
        {!loadError && (
          <div className="card p-6 text-sm text-slate-500">No refund requests yet.</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{loadErrorMessage}</p>
            <button type="button" className="btn-primary text-sm" onClick={() => router.refresh()}>
              Retry
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{actionError}</p>
            {retryAction && (
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={() => postAction(retryAction.refundRequestId, retryAction.endpoint, retryAction.payload)}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
        <div className="overflow-x-auto">
          <table className={`${ADMIN_REFUNDS_TABLE_MIN_WIDTH} w-full text-sm`}>
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Refund ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Order ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Buyer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Seller</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Stripe payment intent</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Created</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {refundRequests.map((request) => (
                <tr key={request.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-4 font-mono text-xs text-slate-500">{request.id}</td>
                  <td className="px-4 py-4 font-mono text-xs text-slate-500">{request.orderId}</td>
                  <td className="px-4 py-4 text-slate-700">
                    <p className="font-semibold text-slate-900">{formatPerson(request.buyer)}</p>
                    <p className="text-xs text-slate-500">{request.buyer.email}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <p className="font-semibold text-slate-900">{formatPerson(request.seller)}</p>
                    <p className="text-xs text-slate-500">{request.seller.email}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <p className="font-semibold text-slate-900">
                      {dollars(request.approvedAmountCents ?? request.requestedAmountCents)}
                    </p>
                    <p className="text-xs text-slate-500">Requested: {dollars(request.requestedAmountCents)}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <p className="font-semibold text-slate-900">{request.reason}</p>
                    {request.details && <p className="mt-1 text-xs text-slate-500">{request.details}</p>}
                    {request.sellerResponse && <p className="mt-1 text-xs text-slate-500">Seller: {request.sellerResponse}</p>}
                    {request.adminNotes && <p className="mt-1 text-xs text-slate-500">Admin: {request.adminNotes}</p>}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
                    {request.resolvedAt && <p className="mt-2 text-xs text-slate-500">Resolved {formatDate(request.resolvedAt)}</p>}
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-500">
                    <p className="font-mono break-all">{request.stripePaymentIntentId ?? '—'}</p>
                    {request.stripeRefundId && <p className="mt-1 text-green-700">Refund: {request.stripeRefundId}</p>}
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-500">{formatDate(request.createdAt)}</td>
                  <td className="px-4 py-4 min-w-[320px]">
                    {renderActionControls(request)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {refundRequests.map((request) => (
          <div key={request.id} className="card space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Refund ID</p>
                <p className="font-mono text-xs text-slate-500 break-all">{request.id}</p>
              </div>
              <span className={`badge ${refundStatusBadge(request.status)}`}>{REFUND_STATUS_LABELS[request.status]}</span>
            </div>

            <div className="grid gap-3 text-sm text-slate-700">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Order ID</p>
                <p className="font-mono text-xs text-slate-500 break-all">{request.orderId}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Buyer</p>
                <p className="font-semibold text-slate-900">{formatPerson(request.buyer)}</p>
                <p className="text-xs text-slate-500">{request.buyer.email}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Seller</p>
                <p className="font-semibold text-slate-900">{formatPerson(request.seller)}</p>
                <p className="text-xs text-slate-500">{request.seller.email}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Amount</p>
                <p className="font-semibold text-slate-900">
                  {dollars(request.approvedAmountCents ?? request.requestedAmountCents)}
                </p>
                <p className="text-xs text-slate-500">Requested: {dollars(request.requestedAmountCents)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Reason</p>
                <p>{request.reason}</p>
                {request.details && <p className="mt-1 text-xs text-slate-500">{request.details}</p>}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stripe payment intent</p>
                <p className="font-mono text-xs text-slate-500 break-all">{request.stripePaymentIntentId ?? '—'}</p>
                {request.stripeRefundId && <p className="mt-1 text-xs text-green-700">Refund: {request.stripeRefundId}</p>}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Created</p>
                <p>{formatDate(request.createdAt)}</p>
                {request.resolvedAt && <p className="mt-1 text-xs text-slate-500">Resolved {formatDate(request.resolvedAt)}</p>}
              </div>
              {request.sellerResponse && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Seller response</p>
                  <p className="text-xs text-slate-500">{request.sellerResponse}</p>
                </div>
              )}
              {request.adminNotes && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Admin note</p>
                  <p className="text-xs text-slate-500">{request.adminNotes}</p>
                </div>
              )}
            </div>

            {renderActionControls(request)}
          </div>
        ))}
      </div>
    </div>
  );
}
