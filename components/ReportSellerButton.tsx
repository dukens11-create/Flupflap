'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

const REASON_OPTIONS = [
  { value: 'scam_fraud', label: 'Scam / fraud concern' },
  { value: 'off_platform_payment', label: 'Asked me to pay outside FlupFlap' },
  { value: 'counterfeit_behavior', label: 'Likely fake or counterfeit items' },
  { value: 'non_delivery', label: 'Takes payment but does not deliver' },
  { value: 'abusive_behavior', label: 'Harassment or abusive behavior' },
  { value: 'other', label: 'Other' },
] as const;

export default function ReportSellerButton({
  sellerId,
  sellerName,
}: {
  sellerId: string;
  sellerName: string;
}) {
  const displaySellerName = sellerName.replace(/\s+/g, ' ').trim() || 'this seller';
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
      const res = await fetch(`/api/sellers/${sellerId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to submit report.');
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
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Thanks for the report. We&apos;ll review {displaySellerName}&apos;s account for suspicious activity.
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
          className="text-xs text-slate-400 hover:text-amber-700 flex items-center gap-1 transition-colors"
        >
          <ShieldAlert size={12} />
          Report seller
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-amber-100 bg-amber-50 p-4 flex flex-col gap-3"
        >
          <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <ShieldAlert size={14} className="text-amber-600" />
            Report {displaySellerName}
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
              {REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
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
              placeholder="Tell us what happened and any off-platform contact or payment requests."
            />
          </div>
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              className="btn bg-amber-600 hover:bg-amber-700 text-white text-sm flex-1"
              disabled={loading || !reason}
            >
              {loading ? 'Submitting…' : 'Submit Seller Report'}
            </button>
            <button
              type="button"
              className="btn-outline text-sm"
              onClick={() => {
                setOpen(false);
                setError('');
                setReason('');
                setNotes('');
              }}
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Reports are reviewed by admins and are not shared with the seller.
          </p>
        </form>
      )}
    </div>
  );
}
