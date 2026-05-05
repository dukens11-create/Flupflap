'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Flag } from 'lucide-react';

const REASON_OPTIONS = [
  { value: 'fake_counterfeit', label: 'Fake / counterfeit item' },
  { value: 'misleading_description', label: 'Misleading description' },
  { value: 'misleading_photos', label: 'Misleading photos' },
  { value: 'prohibited_item', label: 'Prohibited item' },
  { value: 'scam_fraud', label: 'Scam / fraud' },
  { value: 'item_unavailable', label: 'Item unavailable / deceptive availability' },
  { value: 'other', label: 'Other' },
] as const;

export default function ReportItemButton({ productId }: { productId: string }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return;

    if (!session?.user) {
      router.push('/login');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/products/${productId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to submit report.');
        setLoading(false);
        return;
      }
      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (status === 'loading') return null;

  if (success) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800 flex items-center gap-2">
        <span>✓</span>
        <span>Your report has been submitted. Our team will review it.</span>
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            if (!session?.user) {
              router.push('/login');
            } else {
              setOpen(true);
            }
          }}
          className="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1 transition-colors"
        >
          <Flag size={12} />
          Report item
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-red-100 bg-red-50 p-4 flex flex-col gap-3"
        >
          <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <Flag size={14} className="text-red-500" />
            Report this listing
          </p>
          <div>
            <label className="label">Reason <span className="text-red-500">*</span></label>
            <select
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            >
              <option value="">Select a reason…</option>
              {REASON_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Additional details (optional)</label>
            <textarea
              className="input resize-none"
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the issue in more detail…"
            />
          </div>
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              className="btn bg-red-600 hover:bg-red-700 text-white text-sm flex-1"
              disabled={loading || !reason}
            >
              {loading ? 'Submitting…' : 'Submit Report'}
            </button>
            <button
              type="button"
              className="btn-outline text-sm"
              onClick={() => { setOpen(false); setError(''); setReason(''); setNotes(''); }}
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Reports are reviewed by our moderation team. Your identity will not be shared with the seller.
          </p>
        </form>
      )}
    </div>
  );
}
