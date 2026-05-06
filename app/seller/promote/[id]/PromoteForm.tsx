'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { dollars } from '@/lib/money';

const PACKAGES = [
  { days: 7, priceCents: 499, label: '7 days', description: 'Great for fast-selling items' },
  { days: 14, priceCents: 799, label: '14 days', description: 'Best for most sellers' },
  { days: 30, priceCents: 1499, label: '30 days', description: 'Maximum exposure' },
];

export default function PromoteForm({ productId }: { productId: string }) {
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
        {PACKAGES.map(pkg => (
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
        {loading ? 'Redirecting to payment…' : 'Pay & Promote →'}
      </button>

      <p className="text-xs text-slate-400 text-center">
        Secure payment via Stripe. Promotion activates immediately after payment.
      </p>
    </form>
  );
}
