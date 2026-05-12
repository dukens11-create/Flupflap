'use client';

import { useState } from 'react';

const ACTION_OPTIONS = [
  { value: 'dismiss', label: 'Dismiss report' },
  { value: 'resolve', label: 'Mark resolved (no further action)' },
  { value: 'hide_listing', label: 'Hide / remove listing' },
  { value: 'warn_seller', label: 'Warn seller (log only)' },
  { value: 'suspend_seller', label: 'Suspend seller' },
  { value: 'ban_seller', label: 'Ban seller (permanent)' },
];

const DESTRUCTIVE_ACTIONS = ['suspend_seller', 'ban_seller', 'hide_listing'];

interface Props {
  reportId: string;
}

export default function ReportModerationForm({ reportId }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || submitted) return;

    const form = e.currentTarget;
    const data = new FormData(form);
    const action = data.get('action');

    if (!action || typeof action !== 'string') {
      setError('Please select an action.');
      return;
    }

    if (DESTRUCTIVE_ACTIONS.includes(action)) {
      const label = ACTION_OPTIONS.find(o => o.value === action)?.label ?? action;
      const confirmed = window.confirm(
        `Are you sure you want to: "${label}"? This action will affect the seller account.`,
      );
      if (!confirmed) return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/admin/reports/${reportId}/moderate`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: data,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? `Action failed (${res.status})`);
        return;
      }

      setSuccess('Report moderated successfully.');
      setSubmitted(true);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted && success) {
    return (
      <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        ✅ {success}
      </div>
    );
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
        <div>
          <label className="label">Action <span className="text-red-500">*</span></label>
          <select name="action" className="input" required defaultValue="">
            <option value="" disabled>Select action…</option>
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Admin notes (optional, internal only)</label>
          <textarea
            name="adminNotes"
            className="input h-20 resize-none"
            placeholder="Internal notes visible only to admins…"
            maxLength={2000}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Applying…' : 'Apply action'}
        </button>
      </form>
    </details>
  );
}
