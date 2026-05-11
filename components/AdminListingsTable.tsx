'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface AdminListing {
  id: string;
  title: string;
  imageUrl: string;
  mainImage: string;
  images: string[];
  priceCents: number;
  inventory: number;
  status: string;
  condition: string;
  category: string;
  createdAt: string;
  seller: { id: string; name: string };
}

function dollars(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function StatusBadge({ status, inventory }: { status: string; inventory: number }) {
  if (inventory <= 0 && status === 'APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
        Out of stock
      </span>
    );
  }
  const map: Record<string, string> = {
    APPROVED: 'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E7F6EF] text-[#0F8A5F]',
    PENDING: 'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700',
    REJECTED: 'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700',
    HIDDEN: 'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700',
    SOLD: 'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600',
  };
  const dots: Record<string, string> = {
    APPROVED: 'bg-[#0F8A5F]',
    PENDING: 'bg-yellow-500',
    REJECTED: 'bg-red-500',
    HIDDEN: 'bg-red-500',
    SOLD: 'bg-slate-400',
  };
  return (
    <span className={map[status] ?? 'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600'}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status] ?? 'bg-slate-400'}`} />
      {status}
    </span>
  );
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

export default function AdminListingsTable({ listings }: { listings: AdminListing[] }) {
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [conditionFilter, setConditionFilter] = useState('all');
  const [sellerFilter, setSellerFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Derive unique filter options from the full dataset
  const uniqueConditions = useMemo(
    () => Array.from(new Set(listings.map((l) => l.condition).filter(Boolean))).sort(),
    [listings],
  );
  const uniqueSellers = useMemo(
    () =>
      Array.from(new Map(listings.map((l) => [l.seller.id, l.seller.name])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [listings],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return listings.filter((l) => {
      // Search
      if (
        q &&
        !l.title.toLowerCase().includes(q) &&
        !l.seller.name.toLowerCase().includes(q) &&
        !l.category.toLowerCase().includes(q) &&
        !l.status.toLowerCase().includes(q)
      ) {
        return false;
      }
      // Status filter (handle "out_of_stock" as a pseudo-status)
      if (statusFilter === 'out_of_stock') {
        if (!(l.inventory <= 0 && l.status === 'APPROVED')) return false;
      } else if (statusFilter !== 'all') {
        if (l.status !== statusFilter) return false;
      }
      // Condition
      if (conditionFilter !== 'all' && l.condition !== conditionFilter) return false;
      // Seller
      if (sellerFilter !== 'all' && l.seller.id !== sellerFilter) return false;
      // Stock level
      if (stockFilter === 'in_stock' && l.inventory <= 0) return false;
      if (stockFilter === 'low_stock' && (l.inventory <= 0 || l.inventory > 5)) return false;
      if (stockFilter === 'out_of_stock' && l.inventory > 0) return false;
      return true;
    });
  }, [listings, search, statusFilter, conditionFilter, sellerFilter, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Reset page on filter/search change
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleStatus = (v: string) => { setStatusFilter(v); setPage(1); };
  const handleCondition = (v: string) => { setConditionFilter(v); setPage(1); };
  const handleSeller = (v: string) => { setSellerFilter(v); setPage(1); };
  const handleStock = (v: StockFilter) => { setStockFilter(v); setPage(1); };
  const handlePageSize = (v: 10 | 25 | 50) => { setPageSize(v); setPage(1); };

  const doAction = useCallback(
    async (id: string, action: 'approve' | 'reject' | 'remove') => {
      if (action === 'remove') {
        if (!window.confirm('Permanently delete this listing? This cannot be undone.')) return;
      }
      setActionLoading(`${id}:${action}`);
      try {
        if (action === 'remove') {
          await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
        } else {
          const fd = new FormData();
          fd.append('_method', action);
          fd.append('redirectTo', '');
          await fetch(`/api/admin/products/${id}`, { method: 'POST', body: fd });
        }
        router.refresh();
      } finally {
        setActionLoading(null);
      }
    },
    [router],
  );

  const thumbnail = (l: AdminListing) => {
    const src = l.mainImage || (l.images && l.images[0]) || l.imageUrl || '';
    return src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={l.title}
        className="w-10 h-10 object-cover rounded-lg flex-shrink-0 border border-slate-200"
      />
    ) : (
      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-xs flex-shrink-0 border border-slate-200">
        img
      </div>
    );
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const ActionButtons = ({ l }: { l: AdminListing }) => {
    const busy = actionLoading?.startsWith(l.id);
    return (
      <div className="flex flex-wrap gap-1">
        <a
          href={`/products/${l.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-2 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium transition-colors"
        >
          View
        </a>
        <a
          href={`/seller/edit/${l.id}`}
          className="inline-flex items-center px-2 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium transition-colors"
        >
          Edit
        </a>
        {l.status === 'PENDING' && (
          <>
            <button
              disabled={!!busy}
              onClick={() => doAction(l.id, 'approve')}
              className="inline-flex items-center px-2 py-1 text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors disabled:opacity-50"
            >
              Approve
            </button>
            <button
              disabled={!!busy}
              onClick={() => doAction(l.id, 'reject')}
              className="inline-flex items-center px-2 py-1 text-xs rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        {l.status === 'APPROVED' && (
          <button
            disabled={!!busy}
            onClick={() => doAction(l.id, 'reject')}
            className="inline-flex items-center px-2 py-1 text-xs rounded-lg border border-amber-300 hover:bg-amber-50 text-amber-700 font-medium transition-colors disabled:opacity-50"
          >
            Reject
          </button>
        )}
        {l.status === 'REJECTED' && (
          <button
            disabled={!!busy}
            onClick={() => doAction(l.id, 'approve')}
            className="inline-flex items-center px-2 py-1 text-xs rounded-lg border border-green-300 hover:bg-green-50 text-green-700 font-medium transition-colors disabled:opacity-50"
          >
            Approve
          </button>
        )}
        <button
          disabled={!!busy}
          onClick={() => doAction(l.id, 'remove')}
          className="inline-flex items-center px-2 py-1 text-xs rounded-lg border border-red-200 hover:bg-red-50 text-red-600 font-medium transition-colors disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    );
  };

  return (
    <section className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold">All Listings</h2>
        <span className="text-sm text-slate-500">{filtered.length} of {listings.length} listings</span>
      </div>

      {/* Search + Filters */}
      <div className="card p-3 mb-4 space-y-3">
        <input
          type="search"
          placeholder="Search by title, seller, category or status…"
          className="input"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Status */}
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => handleStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
          {/* Condition */}
          <select
            className="input"
            value={conditionFilter}
            onChange={(e) => handleCondition(e.target.value)}
            aria-label="Filter by condition"
          >
            <option value="all">All conditions</option>
            {uniqueConditions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {/* Seller */}
          <select
            className="input"
            value={sellerFilter}
            onChange={(e) => handleSeller(e.target.value)}
            aria-label="Filter by seller"
          >
            <option value="all">All sellers</option>
            {uniqueSellers.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          {/* Stock Level */}
          <select
            className="input"
            value={stockFilter}
            onChange={(e) => handleStock(e.target.value as StockFilter)}
            aria-label="Filter by stock level"
          >
            <option value="all">All stock levels</option>
            <option value="in_stock">In stock</option>
            <option value="low_stock">Low stock (≤5)</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">No listings match the current filters.</div>
      ) : (
        <>
          {/* ── Desktop Table ── */}
          <div className="hidden md:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-12"></th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Product</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Seller</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Price</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Stock</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Created</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginated.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5">{thumbnail(l)}</td>
                      <td className="px-3 py-2.5 max-w-[200px]">
                        <p className="font-medium text-slate-900 truncate" title={l.title}>{l.title}</p>
                        <p className="text-xs text-slate-400 truncate">{l.category}</p>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{l.seller.name}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900 whitespace-nowrap">{dollars(l.priceCents)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className={`font-semibold ${l.inventory <= 0 ? 'text-red-600' : l.inventory <= 5 ? 'text-orange-600' : 'text-green-700'}`}>
                          {l.inventory}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <StatusBadge status={l.status} inventory={l.inventory} />
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap text-xs">{formatDate(l.createdAt)}</td>
                      <td className="px-3 py-2.5">
                        <ActionButtons l={l} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Mobile Cards ── */}
          <div className="md:hidden space-y-2">
            {paginated.map((l) => (
              <div key={l.id} className="card p-3">
                <div className="flex items-center gap-3">
                  {thumbnail(l)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate" title={l.title}>{l.title}</p>
                    <p className="text-xs text-slate-500 truncate">{l.seller.name} · {l.category}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-semibold text-slate-900">{dollars(l.priceCents)}</span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className={`text-xs font-medium ${l.inventory <= 0 ? 'text-red-600' : l.inventory <= 5 ? 'text-orange-600' : 'text-slate-500'}`}>
                        {l.inventory <= 0 ? 'Out of stock' : `${l.inventory} in stock`}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={l.status} inventory={l.inventory} />
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <ActionButtons l={l} />
                </div>
              </div>
            ))}
          </div>

          {/* ── Pagination ── */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>Rows per page:</span>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => handlePageSize(n as 10 | 25 | 50)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    pageSize === n
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">
                {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
