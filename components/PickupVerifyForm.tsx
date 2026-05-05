'use client';

import { useState } from 'react';

export default function PickupVerifyForm({ orderId }: { orderId: string }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/seller/pickup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Verification failed. Please try again.');
      } else {
        setSuccess('✅ Pickup confirmed! Order is now complete.');
        setCode('');
      }
    } catch {
      setError('Network error. Please try again.');
    }

    setLoading(false);
  }

  if (success) {
    return <p className="text-sm text-green-700 font-medium">{success}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-start flex-wrap">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={e => setCode(e.target.value)}
        placeholder="6-digit code"
        className="input w-32 tracking-widest text-center"
        required
        disabled={loading}
      />
      <button type="submit" className="btn-primary text-sm" disabled={loading || code.length !== 6}>
        {loading ? 'Verifying…' : 'Confirm Pickup'}
      </button>
      {error && <p className="w-full text-red-600 text-xs">{error}</p>}
    </form>
  );
}
