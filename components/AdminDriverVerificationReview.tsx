'use client';

import { useState } from 'react';
import { DRIVER_REJECTION_REASONS } from '@/lib/driver-verification-shared';

type Props = {
  userId: string;
  currentStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVIEW';
  currentReason?: string | null;
  currentNotes?: string | null;
  currentDeadline?: string | null;
};

export default function AdminDriverVerificationReview({
  userId,
  currentStatus,
  currentReason,
  currentNotes,
  currentDeadline,
}: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [reason, setReason] = useState(currentReason ?? DRIVER_REJECTION_REASONS[0]);
  const [notes, setNotes] = useState(currentNotes ?? '');
  const [deadline, setDeadline] = useState(currentDeadline ? currentDeadline.slice(0, 16) : '');
  const [requestMore, setRequestMore] = useState(currentStatus === 'REVIEW');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/driver-verifications/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          rejectionReason: status === 'APPROVED' ? undefined : reason,
          adminNotes: notes || undefined,
          approvalDeadline: deadline || undefined,
          requestAdditionalDocuments: requestMore,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to update verification.');
      }
      setMessage('Verification review saved. Refreshing…');
      window.location.reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to update verification.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-slate-700">
          <span className="label">Decision</span>
          <select className="input" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="PENDING">Pending</option>
            <option value="REVIEW">Review</option>
            <option value="APPROVED">Approve</option>
            <option value="REJECTED">Reject</option>
          </select>
        </label>
        <label className="block text-sm text-slate-700">
          <span className="label">Approval deadline</span>
          <input className="input" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
        </label>
      </div>

      {status !== 'APPROVED' && (
        <label className="block text-sm text-slate-700">
          <span className="label">Review / rejection reason</span>
          <select className="input" value={reason} onChange={(event) => setReason(event.target.value)}>
            {DRIVER_REJECTION_REASONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      )}

      <label className="block text-sm text-slate-700">
        <span className="label">Admin notes</span>
        <textarea className="input min-h-32" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Compare the selfie to the license photo, note unusual signals, or request resubmission details." />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={requestMore} onChange={(event) => setRequestMore(event.target.checked)} /> Request additional documents / keep in manual review
      </label>

      {message && <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>}
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Saving…' : 'Save review decision'}
      </button>
    </form>
  );
}
