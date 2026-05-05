"use client";
import { useState } from 'react';

export default function PickupVerifyForm({ orderId }: { orderId: string }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/seller/pickup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, code: code.trim() }),
      });
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Verification failed.');
      } else {
        window.location.href = '/seller?pickup=confirmed';
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleVerify} className="mt-3">
      <p className="text-xs text-slate-500 mb-2">
        Ask the buyer for their 6-digit pickup code and enter it below to confirm the handoff.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          minLength={6}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          className="input w-28 font-mono tracking-widest text-center text-lg"
          placeholder="123456"
          required
        />
        <button type="submit" disabled={loading || code.length !== 6} className="btn-primary text-sm">
          {loading ? 'Verifying…' : 'Confirm pickup'}
        </button>
      </div>
      {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
    </form>
  );
}
