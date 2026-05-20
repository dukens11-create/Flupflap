'use client';

import { useState } from 'react';

export default function MarkDeliveredButton({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/${orderId}/complete`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Unable to mark order as delivered.');
      } else {
        setDone(true);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-green-700 font-medium">
        ✅ Order marked as delivered. Thank you!
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn-primary text-sm"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? 'Updating…' : 'Mark as Received'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
