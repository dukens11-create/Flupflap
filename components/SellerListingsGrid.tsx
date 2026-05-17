"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { toSellerLifecycleStatus } from "@/lib/listing-status";

export interface SellerListingItem {
  id: string;
  title: string;
  category: string;
  condition: string;
  priceCents: number;
  status: string;
  inventory: number;
  viewCount: number;
  soldQty: number;
  imageUrl: string | null;
  cartAdds: number;
  isPromoted: boolean;
  promotionLabel: string | null;
  conversionRate: string | null;
  shippingIncomplete: boolean;
  packageSummary: string | null;
  scheduledFor?: string | null;
  publishedAt?: string | null;
}

interface Props {
  listings: SellerListingItem[];
  isRestricted: boolean;
}

type FilterTab = "all" | "drafts" | "scheduled" | "active" | "sold" | "archived";

function dollars(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function statusLabel(status: string, inventory: number): string {
  const lifecycle = toSellerLifecycleStatus(status);
  if (lifecycle === "DRAFT") return "Draft";
  if (lifecycle === "SCHEDULED") return "Scheduled";
  if (lifecycle === "ACTIVE" && inventory === 0) return "Out of Stock";
  if (lifecycle === "ACTIVE") return "Active";
  if (lifecycle === "SOLD") return "Sold";
  if (lifecycle === "ARCHIVED") return "Archived";
  return status
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function statusBadgeClass(status: string, inventory: number): string {
  const lifecycle = toSellerLifecycleStatus(status);
  if (lifecycle === "ACTIVE" && inventory > 0) return "badge-green";
  if (lifecycle === "ACTIVE" && inventory === 0) return "badge-yellow";
  if (lifecycle === "SCHEDULED") return "badge-blue";
  if (lifecycle === "DRAFT") return "badge-yellow";
  if (lifecycle === "SOLD") return "badge-slate";
  if (lifecycle === "ARCHIVED") return "badge-red";
  return "badge-slate";
}

function matchesFilter(item: SellerListingItem, tab: FilterTab): boolean {
  const lifecycle = toSellerLifecycleStatus(item.status);
  if (tab === "all") return true;
  if (tab === "drafts") return lifecycle === "DRAFT";
  if (tab === "scheduled") return lifecycle === "SCHEDULED";
  if (tab === "active") return lifecycle === "ACTIVE";
  if (tab === "sold") return lifecycle === "SOLD";
  if (tab === "archived") return lifecycle === "ARCHIVED";
  return true;
}

// ─── 3-dot overflow menu ───────────────────────────────────────────────────

interface OverflowMenuProps {
  item: SellerListingItem;
  isRestricted: boolean;
  onDelete: () => void;
}

function OverflowMenu({ item, isRestricted, onDelete }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const canPromote =
    !isRestricted && toSellerLifecycleStatus(item.status) === "ACTIVE" && !item.isPromoted;

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="More actions"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-1 w-44 rounded-xl bg-white shadow-lg border border-slate-200 py-1 text-sm"
          role="menu"
        >
          {toSellerLifecycleStatus(item.status) !== "SOLD" && (
            <Link
              href={`/seller/edit/${item.id}`}
              className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 transition-colors"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
              Edit Listing
            </Link>
          )}
          {!isRestricted && toSellerLifecycleStatus(item.status) === "ACTIVE" && (
            <Link
              href={`/seller/edit/${item.id}#stock`}
              className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 transition-colors"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
              Edit Stock
            </Link>
          )}
          {canPromote && (
            <Link
              href={`/seller/promote/${item.id}`}
              className="flex items-center gap-2 px-3 py-2 text-amber-700 hover:bg-amber-50 transition-colors"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Promote
            </Link>
          )}
          {toSellerLifecycleStatus(item.status) !== "SOLD" && (
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 transition-colors"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Individual listing card ───────────────────────────────────────────────

interface CardProps {
  item: SellerListingItem;
  isRestricted: boolean;
  onDelete: (item: SellerListingItem) => void;
}

function ListingCard({ item, isRestricted, onDelete }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const lifecycle = toSellerLifecycleStatus(item.status);

  const hasExtraDetails =
    item.packageSummary || item.cartAdds > 0 || item.conversionRate !== null;

  return (
    <div className="card p-3 flex gap-3 min-w-0">
      {/* Thumbnail */}
      <div className="flex-shrink-0">
        <div className="relative w-[80px] h-[80px] rounded-xl overflow-hidden bg-white border border-slate-100">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.title}
              fill
              className="object-contain p-0.5"
              sizes="80px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
          )}
          {item.isPromoted && (
            <div className="absolute top-1 left-1 bg-amber-500 text-white text-[10px] font-bold rounded px-1 leading-tight">
              ⭐
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-start justify-between gap-1 min-w-0">
          <p
            className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 flex-1 min-w-0"
            title={item.title}
            aria-label={item.title}
          >
            {item.title}
          </p>
          <OverflowMenu
            item={item}
            isRestricted={isRestricted}
            onDelete={() => onDelete(item)}
          />
        </div>

        {/* Category + price */}
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {item.category} &middot; {item.condition}
        </p>

        {/* Price + status */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-sm font-bold text-slate-900">
            {dollars(item.priceCents)}
          </span>
          <span className={`badge ${statusBadgeClass(item.status, item.inventory)}`}>
            {statusLabel(item.status, item.inventory)}
          </span>
          {item.shippingIncomplete && lifecycle === "ACTIVE" && (
            <span className="badge badge-yellow">⚠ Shipping</span>
          )}
        </div>

        {/* Stats line */}
        <p className="text-xs text-slate-500 mt-1">
          <span>
            Stock:{" "}
            <span
              className={`font-semibold ${
                item.inventory === 0
                  ? "text-red-600"
                  : item.inventory <= 5
                  ? "text-orange-600"
                  : "text-slate-700"
              }`}
            >
              {item.inventory}
            </span>
            {item.inventory <= 5 && item.inventory > 0 && lifecycle === "ACTIVE" && (
              <span className="text-orange-600 font-medium" aria-label="Low stock warning"> ⚠ Low</span>
            )}
          </span>
          <span className="mx-1 text-slate-300">•</span>
          <span>
            Sold: <span className="font-semibold text-slate-700">{item.soldQty}</span>
          </span>
          <span className="mx-1 text-slate-300">•</span>
          <span>
            Views:{" "}
            <span className="font-semibold text-slate-700">
              {item.viewCount.toLocaleString()}
            </span>
          </span>
        </p>

        {/* Promotion label */}
        {item.promotionLabel && (
          <p className="text-xs text-amber-700 mt-0.5 truncate">{item.promotionLabel}</p>
        )}

        {/* Expandable extra details */}
        {hasExtraDetails && (
          <div className="mt-1.5">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5 transition-colors"
              aria-expanded={expanded}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              {expanded ? "Hide details" : "More details"}
            </button>
            {expanded && (
              <div className="mt-1.5 space-y-0.5 text-xs text-slate-500 bg-slate-50 rounded-lg px-2 py-1.5">
                {item.packageSummary && (
                  <p>📦 {item.packageSummary}</p>
                )}
                {item.cartAdds > 0 && (
                  <p>
                    🛒 Cart adds:{" "}
                    <span className="font-semibold text-slate-700">{item.cartAdds}</span>
                  </p>
                )}
                {item.conversionRate !== null && (
                  <p>
                    📈 Conversion:{" "}
                    <span className="font-semibold text-slate-700">{item.conversionRate}%</span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 mt-2">
          <Link
            href={`/products/${item.id}`}
            className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            View
          </Link>
          {lifecycle !== "SOLD" && (
            <Link
              href={`/seller/edit/${item.id}`}
              className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Edit
            </Link>
          )}
          {!isRestricted && lifecycle === "ACTIVE" && (
            <StockEditorInline
              productId={item.id}
              currentInventory={item.inventory}
            />
          )}
          {!isRestricted && lifecycle === "DRAFT" && (
            <button
              disabled={actionBusy}
              onClick={async () => {
                const raw = window.prompt("Schedule date/time (YYYY-MM-DDTHH:mm)");
                if (!raw) return;
                setActionBusy(true);
                await fetch(`/api/seller/products/${item.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ workflowAction: "SCHEDULE", scheduledFor: raw }),
                });
                window.location.reload();
              }}
              className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Schedule
            </button>
          )}
          {!isRestricted && lifecycle === "DRAFT" && (
            <button
              disabled={actionBusy}
              onClick={async () => {
                setActionBusy(true);
                await fetch(`/api/seller/products/${item.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ workflowAction: "PUBLISH_NOW" }),
                });
                window.location.reload();
              }}
              className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Publish now
            </button>
          )}
          {!isRestricted && lifecycle === "SCHEDULED" && (
            <button
              disabled={actionBusy}
              onClick={async () => {
                setActionBusy(true);
                await fetch(`/api/seller/products/${item.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ workflowAction: "PUBLISH_NOW" }),
                });
                window.location.reload();
              }}
              className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Publish now
            </button>
          )}
          {!isRestricted && lifecycle === "SCHEDULED" && (
            <button
              disabled={actionBusy}
              onClick={async () => {
                const raw = window.prompt("Reschedule date/time (YYYY-MM-DDTHH:mm)");
                if (!raw) return;
                setActionBusy(true);
                await fetch(`/api/seller/products/${item.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ workflowAction: "SCHEDULE", scheduledFor: raw }),
                });
                window.location.reload();
              }}
              className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Reschedule
            </button>
          )}
          {!isRestricted && lifecycle === "SCHEDULED" && (
            <button
              disabled={actionBusy}
              onClick={async () => {
                setActionBusy(true);
                await fetch(`/api/seller/products/${item.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ workflowAction: "CANCEL_SCHEDULE" }),
                });
                window.location.reload();
              }}
              className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel schedule
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Inline stock editor (compact) ────────────────────────────────────────

interface StockEditorProps {
  productId: string;
  currentInventory: number;
}

function StockEditorInline({ productId, currentInventory }: StockEditorProps) {
  const [inventory, setInventory] = useState(currentInventory);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(currentInventory));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  async function save() {
    const value = parseInt(inputValue, 10);
    if (!Number.isInteger(value) || value < 0 || value > 9999) {
      setError("Inventory must be between 0 and 9999.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/seller/products/${productId}/inventory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed");
      } else {
        setInventory(value);
        setEditing(false);
        setSaved(true);
        savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={9999}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="w-14 border border-slate-300 rounded-lg px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-60 transition-colors"
        >
          {saving ? "…" : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
        >
          ✕
        </button>
        {error && <span className="text-red-600 text-xs">{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setInputValue(String(inventory));
        setEditing(true);
        setError("");
        setSaved(false);
      }}
      className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
    >
      {saved ? "✓ Saved" : "Stock"}
    </button>
  );
}

// ─── Delete confirmation ───────────────────────────────────────────────────

interface DeleteDialogProps {
  item: SellerListingItem | null;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}

function DeleteDialog({ item, onCancel, onConfirm }: DeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (!item) return null;

  async function handleDelete() {
    if (!item) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/seller/products/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to delete. Please try again.");
        setDeleting(false);
      } else {
        onConfirm(item.id);
      }
    } catch {
      setError("Network error. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h3 className="font-bold text-slate-900 text-base mb-1">Delete listing?</h3>
        <p className="text-sm text-slate-600 mb-4 line-clamp-2">
          &quot;{item.title}&quot; will be permanently deleted and cannot be
          recovered.
        </p>
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main grid component ───────────────────────────────────────────────────

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "drafts", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "active", label: "Active" },
  { key: "sold", label: "Sold" },
  { key: "archived", label: "Archived" },
];

export default function SellerListingsGrid({ listings, isRestricted }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [items, setItems] = useState<SellerListingItem[]>(listings);
  const [deleteTarget, setDeleteTarget] = useState<SellerListingItem | null>(null);

  const filtered = items.filter((item) => {
    const matchesTab = matchesFilter(item, filter);
    const matchesSearch =
      search.trim() === "" ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  function handleDeleteConfirm(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDeleteTarget(null);
  }

  function tabCount(tab: FilterTab) {
    return items.filter((i) => matchesFilter(i, tab)).length;
  }

  return (
    <>
      {/* ── Filter bar ── */}
      <div className="mb-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Search your listings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {FILTER_TABS.map(({ key, label }) => {
            const count = tabCount(key);
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? "bg-[var(--ff-primary-navy)] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {label}
                <span
                  className={`text-[10px] font-semibold tabular-nums ${
                    active ? "text-white/80" : "text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Cards grid ── */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-slate-500 text-sm">
          {search.trim() !== "" || filter !== "all"
            ? "No listings match your search or filter."
            : "No listings yet."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((item) => (
            <ListingCard
              key={item.id}
              item={item}
              isRestricted={isRestricted}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* ── Delete dialog ── */}
      <DeleteDialog
        item={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
