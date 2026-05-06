'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { dollars } from '@/lib/money';

type PromotionPlan = {
  durationDays: number;
  priceCents: number;
  label: string;
  description: string | null;
};

export default function PromoteForm({ productId, plans }: { productId: string; plans: PromotionPlan[] }) {
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
        body: JSON.stringify({ productId, durationDays: selected }),
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        {plans.map(plan => (
          <label
            key={plan.durationDays}
            className={`card p-4 flex items-center gap-4 cursor-pointer transition-colors ${
              selected === plan.durationDays ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              name="duration"
              value={plan.durationDays}
              checked={selected === plan.durationDays}
              onChange={() => setSelected(plan.durationDays)}
              className="accent-blue-600"
            />
            <div className="flex-1">
              <p className="font-semibold text-slate-800">{plan.label}</p>
              <p className="text-sm text-slate-500">{plan.description}</p>
            </div>
            <p className="font-black text-blue-700 text-lg">{dollars(plan.priceCents)}</p>
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
        {loading ? 'Redirecting to payment…' : 'Pay & Promote →'}
      </button>

      <p className="text-xs text-slate-400 text-center">
        Secure payment via Stripe. Promotion activates only after payment is verified.
      </p>
    </form>
  );
}
