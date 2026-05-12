'use client';

import { useState } from 'react';

const REASON_LABELS: Record<string, string> = {
  misconduct_to_customer: 'Misconduct to customer',
  fake_product: 'Fake product',
  unlawful_activity: 'Unlawful activity',
  fraud: 'Fraud',
  spam: 'Spam',
  policy_violation: 'Policy violation',
  other: 'Other',
};

const REASON_OPTIONS = Object.entries(REASON_LABELS);

const DESTRUCTIVE_ACTIONS = ['BANNED', 'SUSPENDED', 'RESTRICTED'];

const ACTION_LABELS: Record<string, string> = {
  SUSPENDED: 'Suspend (temporary)',
  RESTRICTED: 'Restrict (partial restriction)',
  BANNED: 'Ban (permanent)',
  REINSTATED: 'Reinstate (lift restriction)',
};

interface Props {
  sellerId: string;
  sellerName: string;
}

export default function SellerModerationForm({ sellerId, sellerName }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const form = e.currentTarget;
    const data = new FormData(form);
    const action = data.get('action');

    if (!action || typeof action !== 'string') {
      setError('Please select an action.');
      return;
    }

    if (DESTRUCTIVE_ACTIONS.includes(action)) {
      const label = ACTION_LABELS[action] ?? action;
      const confirmed = window.confirm(
        `Are you sure you want to ${label.toLowerCase()} ${sellerName}? This will affect their ability to sell on the platform.`,
      );
      if (!confirmed) return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/admin/sellers/${sellerId}/moderate`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: data,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? `Action failed (${res.status})`);
        return;
      }

      setSuccess('Moderation action applied successfully.');
      form.reset();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900 select-none list-none flex items-center gap-1">
        <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
        Moderation actions
      </summary>
      <form
        onSubmit={handleSubmit}
        className="mt-4 space-y-3 border-t border-slate-100 pt-4"
      >
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            ⚠ {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            ✅ {success}
          </div>
        )}
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <label className="label">Action</label>
            <select name="action" className="input" required defaultValue="">
              <option value="" disabled>Select action…</option>
              <option value="SUSPENDED">Suspend (temporary)</option>
              <option value="RESTRICTED">Restrict (partial restriction)</option>
              <option value="BANNED">Ban (permanent)</option>
              <option value="REINSTATED">Reinstate (lift restriction)</option>
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="label">Reason category</label>
            <select name="reasonCategory" className="input" defaultValue="">
              <option value="">Select reason… (required unless reinstating)</option>
              {REASON_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Notes (optional, internal only)</label>
          <textarea
            name="notes"
            className="input h-20 resize-none"
            placeholder="Additional context visible only to admins…"
            maxLength={1000}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Applying…' : 'Apply action'}
          </button>
        </div>
      </form>
    </details>
  );
}
