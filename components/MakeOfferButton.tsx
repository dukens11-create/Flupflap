'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Tag } from 'lucide-react';

export default function MakeOfferButton({
  productId,
  priceCents,
}: {
  productId: string;
  priceCents: number;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submitOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user) {
      router.push('/login');
      return;
    }

    const normalized = Number(amount);
    const amountCents = Math.round(normalized * 100);
    if (!Number.isFinite(normalized) || amountCents <= 0) {
      setError('Enter a valid offer amount.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          amountCents,
          message: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send offer.');
      } else {
        setSuccess('Offer sent. You can track it from your notifications or offers.');
        setAmount('');
        setNote('');
        router.refresh();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (status === 'loading') return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      {!open ? (
        <button
          type="button"
          className="btn-outline w-full flex items-center justify-center gap-2"
          onClick={() => {
            if (!session?.user) {
              router.push('/login');
            } else {
              setOpen(true);
            }
          }}
        >
          <Tag size={16} />
          Make an offer
        </button>
      ) : (
        <form onSubmit={submitOffer} className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Send a price offer</p>
            <p className="text-xs text-slate-500 mt-1">
              Listing price: ${(priceCents / 100).toFixed(2)}. Offers stay in-app so both sides can review them.
            </p>
          </div>
          <input
            type="number"
            min="0.01"
            step="0.01"
            className="input"
            placeholder="Your offer in USD"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={loading}
          />
          <textarea
            className="input resize-none"
            rows={3}
            maxLength={500}
            placeholder="Optional note for the seller"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={loading}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          {success && <p className="text-xs text-green-700">{success}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={loading || !amount}
            >
              {loading ? 'Sending…' : 'Send offer'}
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                setOpen(false);
                setError('');
                setSuccess('');
              }}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
