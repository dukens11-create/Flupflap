'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  saleId: string;
};

export default function GarageSalePaymentSyncButton({ saleId }: Props) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSync = async () => {
    setIsSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/sync-payment`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const reason = typeof data?.reason === 'string' ? data.reason : 'sync_failed';
        if (reason === 'payment_not_paid') {
          throw new Error('Stripe has not marked this checkout as paid yet. Please try again shortly.');
        }
        throw new Error('Unable to sync payment right now. Please try again.');
      }
      setMessage('Payment status synced. Listing details refreshed.');
      router.refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Unable to sync payment right now. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-2">
      <button type="button" className="btn-outline w-full text-xs" onClick={onSync} disabled={isSyncing}>
        {isSyncing ? 'Syncing…' : 'Sync Payment Status'}
      </button>
      {message && <p className="text-xs text-green-700">{message}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
