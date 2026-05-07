'use client';

import { useState } from 'react';

type Props = {
  hasBillingAccount: boolean;
  status: string | null;
  manage?: boolean;
};

/**
 * Button that initiates seller subscription enrollment or opens the Stripe
 * Customer Portal for subscription management.
 */
export default function SubscriptionButton({ hasBillingAccount, status, manage }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setLoading(true);
    setError('');
    try {
      if (manage && hasBillingAccount) {
        const res = await fetch('/api/seller/subscription/portal', { method: 'POST' });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError(data.error || 'Failed to open billing portal.');
        }
      } else {
        const res = await fetch('/api/seller/subscription', { method: 'POST' });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError(data.error || 'Failed to start subscription checkout.');
        }
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const label = manage
    ? 'Manage subscription'
    : status === 'PAST_DUE' || status === 'CANCELLED'
      ? 'Reactivate subscription'
      : 'Subscribe for $4.99/month';

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className={manage ? 'btn-outline text-xs flex-shrink-0' : 'btn-primary text-sm self-start'}
      >
        {loading ? 'Loading…' : label}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
