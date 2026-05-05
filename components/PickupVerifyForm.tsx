"use client";

import { useState } from 'react';

export default function PickupVerifyForm({ orderId }: { orderId: string }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/${orderId}/pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error ?? 'Failed to verify code.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800 font-medium">
        ✅ Pickup confirmed! Order marked as picked up.
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter buyer's pickup code"
          maxLength={6}
          className="input flex-1 font-mono tracking-widest uppercase text-center"
          required
        />
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="btn-primary text-sm whitespace-nowrap"
        >
          {loading ? 'Verifying…' : 'Verify pickup'}
        </button>
      </form>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
