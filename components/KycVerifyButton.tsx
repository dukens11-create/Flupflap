'use client';

import { useState } from 'react';

export default function KycVerifyButton({ isRejected = false }: { isRejected?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handleVerify() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setStatusMessage('Redirecting to secure identity verification...');
    try {
      const res = await fetch('/api/seller/verification/initiate', {
        method: 'POST',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409) {
          setError(data?.error ?? 'Your identity is already verified.');
        } else if (res.status === 401 || res.status === 403) {
          setError('Your session expired. Please sign in again and retry.');
        } else {
          setError(data?.error ?? 'Unable to start verification. Please try again.');
        }
        setStatusMessage(null);
        setLoading(false);
        return;
      }
      if (!data?.sessionUrl) {
        setError('Stripe did not return a verification URL. Please try again.');
        setStatusMessage(null);
        setLoading(false);
        return;
      }
      window.location.href = data.sessionUrl;
    } catch {
      setError('Network error. Please check your connection and try again.');
      setStatusMessage(null);
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      {statusMessage ? (
        <p className="text-sm text-slate-600 animate-pulse">
          {statusMessage}
        </p>
      ) : (
        <button type="button" className="btn-primary" onClick={handleVerify} disabled={loading}>
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
