'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Star, EyeOff, AlertTriangle, Trash2 } from 'lucide-react';

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
  paymentStatus: string;
  totalPaidCents: number;
  viewCount: number;
  createdAt: string;
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
  const router = useRouter();
  const [sales, setSales] = useState(initialSales);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      } else {
        const updated = await res.json();
        setSales((prev) => prev.map((s) => s.id === id ? { ...s, ...updated } : s));
      }
    } catch {
      setError('Network error');
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

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

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
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((sale) => (
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
                ))}
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
    </div>
  );
}
