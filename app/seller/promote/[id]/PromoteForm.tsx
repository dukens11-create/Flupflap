'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { dollars } from '@/lib/money';
import { PROMOTION_PACKAGE_LIST } from '@/lib/promotions';
import type { PromotionAction } from '@/app/api/seller/promote/route';

interface PromoteFormProps {
  productId: string;
  mode: PromotionAction;
  /** For pre-expiry renewals, the date the new promotion will start */
  scheduledStart?: string | null;
}

export default function PromoteForm({ productId, mode, scheduledStart }: PromoteFormProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/seller/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, durationDays: selected, action: mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
        setLoading(false);
        return;
      }
      router.push(data.url);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  const submitLabel =
    mode === 'renew' ? 'Pay & Renew →' :
    mode === 'change' ? 'Pay & Change Duration →' :
    'Pay & Promote →';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === 'renew' && scheduledStart && (
        <div className="card p-3 bg-blue-50 border-blue-200 text-blue-700 text-sm">
          ℹ️ Your current promotion is still active. The renewal will begin automatically on{' '}
          <strong>{new Date(scheduledStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>.
        </div>
      )}
      {mode === 'change' && (
        <div className="card p-3 bg-amber-50 border-amber-200 text-amber-700 text-sm">
          ⚡ Changing duration will end your current promotion immediately and start a new one.
          You will be charged the full price for the new duration.
        </div>
      )}

      <div className="space-y-3">
        {PROMOTION_PACKAGE_LIST.map(pkg => (
          <label
            key={pkg.days}
            className={`card p-4 flex items-center gap-4 cursor-pointer transition-colors ${
              selected === pkg.days ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              name="duration"
              value={pkg.days}
              checked={selected === pkg.days}
              onChange={() => setSelected(pkg.days)}
              className="accent-blue-600"
            />
            <div className="flex-1">
              <p className="font-semibold text-slate-800">{pkg.label}</p>
              <p className="text-sm text-slate-500">{pkg.description}</p>
            </div>
            <p className="font-black text-blue-700 text-lg">{dollars(pkg.priceCents)}</p>
          </label>
        ))}
      </div>

      {error && (
        <div className="card p-3 bg-red-50 border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <button
        type="submit"
        disabled={!selected || loading}
        className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Redirecting to payment…' : submitLabel}
      </button>

      <p className="text-xs text-slate-400 text-center">
        Secure payment via Stripe.{' '}
        {mode === 'renew' && scheduledStart
          ? 'Promotion activates on the scheduled date.'
          : 'Promotion activates immediately after payment.'}
      </p>
    </form>
  );
}
