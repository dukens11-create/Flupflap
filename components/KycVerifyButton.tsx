'use client';

import { useState } from 'react';
import { readApiMessage } from '@/lib/read-api-message';

export default function KycVerifyButton({ isRejected = false }: { isRejected?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/seller/verification/initiate', {
        method: 'POST',
      });
      if (!res.ok) {
        setError(await readApiMessage(res, 'Unable to start verification. Please try again.'));
        setLoading(false);
        return;
      }
      const data = await res.json();
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
          Redirecting to secure identity verification...
        </p>
      ) : (
        <button className="btn-primary" onClick={handleVerify} disabled={loading}>
          {isRejected ? 'Re-submit Verification' : 'Verify Identity'}
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
