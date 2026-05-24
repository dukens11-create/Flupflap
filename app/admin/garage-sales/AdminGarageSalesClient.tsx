'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Star, EyeOff, AlertTriangle, Trash2 } from 'lucide-react';
import {
  GARAGE_SALE_COMPENSATION_NOT_ELIGIBLE_MESSAGE,
  GARAGE_SALE_COMPENSATION_NOTE_REQUIRED_MESSAGE,
  formatGarageSaleCompensationReason,
  getGarageSaleCompensationIneligibilityReason,
  isGarageSaleCompensationEligible,
  isGarageSaleCompensationOverrideEligible,
  normalizeGarageSaleCompensationNote,
  parseGarageSaleCompensationAudit,
  type GarageSaleCompensationReason,
} from '@/lib/garage-sale-compensation';

type AdminSale = {
  id: string;
  title: string;
  saleType: string;
  status: string;
  city: string;
  state: string;
  zipCode: string;
  startDate: string;
  endDate: string;
  isFeatured: boolean;
  isSpam: boolean;
  isLive: boolean;
  isArchived: boolean;
  paymentStatus: string;
  totalPaidCents: number;
  viewCount: number;
  createdAt: string;
  adminNotes: string | null;
  compensationGranted?: boolean;
  compensationEligible?: boolean;
  compensationIneligibilityReason?: string;
  seller: { id: string; name: string; email: string };
  _count: { reports: number; favorites: number };
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'badge-yellow',
  APPROVED: 'badge-green',
  REJECTED: 'badge-red',
  HIDDEN: 'badge-slate',
  EXPIRED: 'badge-slate',
};

const SALE_TYPE_LABELS: Record<string, string> = {
  GARAGE_SALE: 'Garage Sale',
  YARD_SALE: 'Yard Sale',
  ESTATE_SALE: 'Estate Sale',
  MOVING_SALE: 'Moving Sale',
};

interface Props {
  sales: AdminSale[];
  total: number;
  page: number;
  totalPages: number;
  statusFilter: string;
}

export default function AdminGarageSalesClient({ sales: initialSales, total, page, totalPages, statusFilter }: Props) {
  const [sales, setSales] = useState(initialSales);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCompensationSaleId, setActiveCompensationSaleId] = useState<string | null>(null);
  const [compensationDrafts, setCompensationDrafts] = useState<Record<string, {
    reason: GarageSaleCompensationReason;
    note: string;
  }>>({});

  async function doAction(id: string, action: string, extra: Record<string, unknown> = {}) {
    setLoading(id + action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/garage-sales/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Action failed');
        return false;
      } else {
        const updated = await res.json();
        setSales((prev) => prev.map((s) => s.id === id ? { ...s, ...updated } : s));
        return true;
      }
    } catch {
      setError('Network error');
      return false;
    } finally {
      setLoading(null);
    }
  }

  async function doDelete(id: string) {
    if (!confirm('Delete this garage sale listing? This cannot be undone.')) return;
    setLoading(id + 'delete');
    try {
      const res = await fetch(`/api/admin/garage-sales/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSales((prev) => prev.filter((s) => s.id !== id));
      } else {
        const d = await res.json();
        setError(d.error ?? 'Delete failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(null);
    }
  }

  function pageUrl(p: number) {
    return `/admin/garage-sales?status=${statusFilter}&page=${p}`;
  }

  function getCompensationDraft(id: string) {
    return compensationDrafts[id] ?? { reason: 'ended_early', note: '' };
  }

  function updateCompensationDraft(
    id: string,
    updates: Partial<{ reason: GarageSaleCompensationReason; note: string }>,
  ) {
    setCompensationDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { reason: 'ended_early', note: '' }),
        ...updates,
      },
    }));
  }

  async function grantCompensation(id: string, forceCompensation = false) {
    const draft = getCompensationDraft(id);
    const note = normalizeGarageSaleCompensationNote(draft.note);
    if (!note) {
      setError(GARAGE_SALE_COMPENSATION_NOTE_REQUIRED_MESSAGE);
      return;
    }

    const didGrant = await doAction(id, 'grant_compensation', {
      compensationReason: draft.reason,
      notes: note,
      forceCompensation,
    });
    if (didGrant) {
      setActiveCompensationSaleId(null);
    }
  }

  const eligibilityNow = new Date();
  const saleCompensation = sales.map((sale) => {
    const compensationAudit = parseGarageSaleCompensationAudit(sale.adminNotes);
    const compensationGranted = Boolean(sale.compensationGranted || compensationAudit);
    const compensationInput = {
      isLive: sale.isLive,
      isArchived: sale.isArchived,
      isSpam: sale.isSpam,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      startDate: new Date(sale.startDate),
      endDate: new Date(sale.endDate),
    };
    const computedEligible = isGarageSaleCompensationEligible(compensationInput, eligibilityNow);
    const computedOverrideEligible = isGarageSaleCompensationOverrideEligible(compensationInput, eligibilityNow);
    const isCompensationEligible = !compensationGranted && (sale.compensationEligible ?? computedEligible);
    const canOverrideCompensation = !compensationGranted && !isCompensationEligible && computedOverrideEligible;
    const ineligibilityReason = sale.compensationIneligibilityReason
      ?? getGarageSaleCompensationIneligibilityReason(compensationInput, eligibilityNow)
      ?? GARAGE_SALE_COMPENSATION_NOT_ELIGIBLE_MESSAGE;

    return {
      sale,
      compensationAudit,
      compensationGranted,
      isCompensationEligible,
      canOverrideCompensation,
      ineligibilityReason,
    };
  });

  const eligibleCompensationCount = saleCompensation.filter((entry) => entry.isCompensationEligible || entry.canOverrideCompensation).length;
  const grantedCompensationCount = saleCompensation.filter((entry) => entry.compensationGranted).length;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <section id="compensation-management" className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Compensation management</p>
            <h2 className="mt-1 text-lg font-black text-slate-900">Grant free replacement garage sale lives without developer help</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Use the compensation column below to choose the affected seller&apos;s issue, add an audit note, and grant one free replacement live.
              Existing compensation history stays visible so the same disrupted sale is not compensated twice.
            </p>
            <p className="mt-2 max-w-3xl text-xs text-slate-500">
              Paid approved/expired listings are directly eligible once started. Hidden or archived paid listings can still be granted through admin override when business-approved.
              Spam, unpaid, and refunded listings remain locked.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center text-sm">
            <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
              <p className="text-2xl font-black text-emerald-700">{eligibleCompensationCount}</p>
              <p className="text-slate-500">Eligible now</p>
            </div>
            <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
              <p className="text-2xl font-black text-slate-900">{grantedCompensationCount}</p>
              <p className="text-slate-500">Already compensated</p>
            </div>
          </div>
        </div>
      </section>

      {sales.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">No garage sales found.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left">Listing</th>
                  <th className="px-4 py-3 text-left">Seller</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Dates</th>
                  <th className="px-4 py-3 text-left">Payment</th>
                  <th className="px-4 py-3 text-center">Views</th>
                  <th className="px-4 py-3 text-center">Reports</th>
                  <th className="px-4 py-3 text-left">Compensation</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {saleCompensation.map(({ sale, compensationAudit, compensationGranted, isCompensationEligible, canOverrideCompensation, ineligibilityReason }) => {
                  return (
                  <tr key={sale.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/garage-sales/${sale.id}`} target="_blank" className="font-semibold text-slate-900 hover:text-[var(--ff-primary-navy)] hover:underline line-clamp-1">
                        {sale.title}
                      </Link>
                      <p className="text-xs text-slate-500">{SALE_TYPE_LABELS[sale.saleType] ?? sale.saleType} · {sale.city}, {sale.state}</p>
                      {sale.isFeatured && <span className="badge badge-yellow text-[10px]">⭐ Featured</span>}
                      {sale.isSpam && <span className="badge badge-red text-[10px] ml-1">Spam</span>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 text-xs">{sale.seller.name}</p>
                      <p className="text-xs text-slate-400">{sale.seller.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${STATUS_BADGE[sale.status] ?? 'badge-slate'}`}>{sale.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <p>{new Date(sale.startDate).toLocaleDateString()}</p>
                      <p>→ {new Date(sale.endDate).toLocaleDateString()}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <p className="font-semibold">{sale.paymentStatus}</p>
                      <p>${(sale.totalPaidCents / 100).toFixed(2)}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600">{sale.viewCount}</td>
                    <td className="px-4 py-3 text-center">
                      {sale._count.reports > 0 ? (
                        <span className="badge badge-red">{sale._count.reports}</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {compensationGranted && compensationAudit ? (
                        <div className="space-y-1 text-xs text-slate-600">
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">
                            Compensation granted
                          </span>
                          <p className="font-semibold text-slate-900">{formatGarageSaleCompensationReason(compensationAudit.reason)}</p>
                          {compensationAudit.note && <p>{compensationAudit.note}</p>}
                          <p>Granted {new Date(compensationAudit.at).toLocaleString()}</p>
                          {compensationAudit.replacement && (
                            <Link
                              href={`/garage-sales/${compensationAudit.replacement}`}
                              target="_blank"
                              className="font-semibold text-[var(--ff-primary-navy)] hover:underline"
                            >
                              View replacement live
                            </Link>
                          )}
                        </div>
                      ) : isCompensationEligible ? (
                        <div className="min-w-[220px] space-y-2 rounded-xl border border-emerald-200 bg-white p-3">
                          <button
                            onClick={() => setActiveCompensationSaleId(sale.id)}
                            disabled={loading === sale.id + 'grant_compensation' || activeCompensationSaleId === sale.id}
                            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Grant Compensation
                          </button>
                          <p className="text-xs text-slate-500">Grant one free replacement live with required audit details.</p>
                        </div>
                      ) : canOverrideCompensation ? (
                        <div className="min-w-[220px] space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <button
                            onClick={() => setActiveCompensationSaleId(sale.id)}
                            disabled={loading === sale.id + 'grant_compensation' || activeCompensationSaleId === sale.id}
                            className="w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            Grant with override
                          </button>
                          <p className="text-xs text-amber-700">Requires explicit admin override and audit note.</p>
                        </div>
                      ) : (
                        <p className="max-w-[220px] text-xs text-slate-500" title={ineligibilityReason}>
                          {ineligibilityReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {sale.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => doAction(sale.id, 'approve')}
                              disabled={loading === sale.id + 'approve'}
                              title="Approve"
                              className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <CheckCircle size={13} /> Approve
                            </button>
                            <button
                              onClick={() => doAction(sale.id, 'reject')}
                              disabled={loading === sale.id + 'reject'}
                              title="Reject"
                              className="flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              <XCircle size={13} /> Reject
                            </button>
                          </>
                        )}
                        {sale.status === 'APPROVED' && !sale.isFeatured && (
                          <button
                            onClick={() => doAction(sale.id, 'feature')}
                            disabled={loading === sale.id + 'feature'}
                            title="Feature"
                            className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                          >
                            <Star size={13} /> Feature
                          </button>
                        )}
                        {sale.isFeatured && (
                          <button
                            onClick={() => doAction(sale.id, 'unfeature')}
                            disabled={loading === sale.id + 'unfeature'}
                            title="Remove featured"
                            className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                          >
                            <Star size={13} /> Unfeature
                          </button>
                        )}
                        {!sale.isSpam && (
                          <button
                            onClick={() => doAction(sale.id, 'mark_spam')}
                            disabled={loading === sale.id + 'mark_spam'}
                            title="Mark spam"
                            className="flex items-center gap-1 rounded-lg bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                          >
                            <AlertTriangle size={13} /> Spam
                          </button>
                        )}
                        {sale.status !== 'HIDDEN' && (
                          <button
                            onClick={() => doAction(sale.id, 'hide')}
                            disabled={loading === sale.id + 'hide'}
                            title="Hide"
                            className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                          >
                            <EyeOff size={13} /> Hide
                          </button>
                        )}
                        {sale.paymentStatus === 'PAID' && (
                          <button
                            onClick={() => doAction(sale.id, 'refund')}
                            disabled={loading === sale.id + 'refund'}
                            title="Refund latest payment"
                            className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                          >
                            Refund
                          </button>
                        )}
                        <button
                          onClick={() => doDelete(sale.id)}
                          disabled={loading === sale.id + 'delete'}
                          title="Delete"
                          className="flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={pageUrl(page - 1)} className="flex items-center gap-1 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <ChevronLeft size={16} /> Previous
            </Link>
          )}
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <Link href={pageUrl(page + 1)} className="flex items-center gap-1 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Next <ChevronRight size={16} />
            </Link>
          )}
        </div>
      )}

      {activeCompensationSaleId && (() => {
        const selectedEntry = saleCompensation.find((entry) => entry.sale.id === activeCompensationSaleId);
        if (!selectedEntry || (!selectedEntry.isCompensationEligible && !selectedEntry.canOverrideCompensation)) return null;

        const selectedDraft = getCompensationDraft(selectedEntry.sale.id);
        const requiresOverride = selectedEntry.canOverrideCompensation && !selectedEntry.isCompensationEligible;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
              <h3 className="text-lg font-black text-slate-900">{requiresOverride ? 'Grant Compensation (Override)' : 'Grant Compensation'}</h3>
              <p className="mt-1 text-sm text-slate-600">
                Confirm a free replacement live for <span className="font-semibold text-slate-900">{selectedEntry.sale.seller.name}</span>.
              </p>
              {requiresOverride && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  This listing is outside standard eligibility. Use override only for approved business exceptions.
                </p>
              )}
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Compensation reason
                  <select
                    value={selectedDraft.reason}
                    onChange={(event) => updateCompensationDraft(selectedEntry.sale.id, {
                      reason: event.target.value as GarageSaleCompensationReason,
                    })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="ended_early">Live ended early</option>
                    <option value="system_cutoff">Platform issue / system cutoff</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Audit note
                  <textarea
                    value={selectedDraft.note}
                    onChange={(event) => updateCompensationDraft(selectedEntry.sale.id, { note: event.target.value })}
                    rows={4}
                    maxLength={1000}
                    placeholder="Example: Seller live was cut off 18 minutes early during outage."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveCompensationSaleId(null)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => grantCompensation(selectedEntry.sale.id, requiresOverride)}
                  disabled={loading === selectedEntry.sale.id + 'grant_compensation'}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Confirm grant
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
