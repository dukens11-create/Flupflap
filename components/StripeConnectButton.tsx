'use client';

import { useState } from 'react';

type StripeConnectButtonProps = {
  label?: string;
  className?: string;
  loadingText?: string;
};

export default function StripeConnectButton({
  label = 'Connect Stripe',
  className = 'btn-outline text-xs',
  loadingText = 'Redirecting to Stripe onboarding...',
}: StripeConnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/stripe/connect/create-link', {
        method: 'POST',
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? 'Unable to connect Stripe right now. Please try again.');
        setLoading(false);
        return;
      }

      if (!data?.url) {
        setError('Stripe onboarding link was not returned. Please try again.');
        setLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" className={className} onClick={handleConnect} disabled={loading}>
        {loading ? 'Redirecting…' : label}
      </button>
      {loading && <p className="text-xs text-slate-500">{loadingText}</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
