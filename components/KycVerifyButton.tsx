'use client';

import { useState } from 'react';

export default function KycVerifyButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/seller/verification/initiate', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Unable to start verification. Please try again.');
        setLoading(false);
        return;
      }
      if (!data?.sessionUrl) {
        setError('Stripe did not return a verification URL. Please try again.');
        setLoading(false);
        return;
      }
      window.location.href = data.sessionUrl;
    } catch {
      setError('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      {loading ? (
        <p className="text-sm text-slate-600 animate-pulse">
          Redirecting to secure identity verification…
        </p>
      ) : (
        <button className="btn-primary" onClick={handleVerify} disabled={loading}>
          Verify Identity
        </button>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
