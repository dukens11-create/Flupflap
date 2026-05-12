'use client';

import { useState } from 'react';

const SELLER_REPORT_ACTIONS = [
  { value: 'dismiss', label: 'Dismiss' },
  { value: 'resolve', label: 'Resolve only' },
  { value: 'warn_seller', label: 'Warn seller' },
  { value: 'suspend_seller', label: 'Suspend seller' },
  { value: 'ban_seller', label: 'Ban seller' },
] as const;

const DESTRUCTIVE_ACTIONS = ['suspend_seller', 'ban_seller'];

interface Props {
  reportId: string;
  sellerName: string;
}

export default function FraudSellerReportForm({ reportId, sellerName }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || submitted) return;

    const form = e.currentTarget;
    const data = new FormData(form);
    const action = data.get('action') as string;

    if (DESTRUCTIVE_ACTIONS.includes(action)) {
      const label = SELLER_REPORT_ACTIONS.find(a => a.value === action)?.label ?? action;
      const confirmed = window.confirm(
        `Are you sure you want to "${label}" for seller "${sellerName}"? This will impact their account.`,
      );
      if (!confirmed) return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/seller-reports/${reportId}/moderate`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: data,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? `Action failed (${res.status})`);
        return;
      }

      setSubmitted(true);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        ✅ Action applied — refresh to see updated report status.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 grid gap-3 md:grid-cols-[220px_1fr_auto]"
    >
      {error && (
        <div className="md:col-span-3 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800">
          ⚠ {error}
        </div>
      )}
      <select name="action" className="input text-sm" required defaultValue="">
        <option value="" disabled>Select action…</option>
        {SELLER_REPORT_ACTIONS.map((action) => (
          <option key={action.value} value={action.value}>{action.label}</option>
        ))}
      </select>
      <textarea
        name="adminNotes"
        className="input h-24 resize-none"
        placeholder="Internal notes for trust & safety review"
        maxLength={2000}
      />
      <button
        type="submit"
        disabled={submitting}
        className="btn-primary text-sm h-fit disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? 'Applying…' : 'Apply'}
      </button>
    </form>
  );
}
