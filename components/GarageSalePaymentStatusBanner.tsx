'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  saleId: string;
  initialPaymentStatus: string;
  initialListingStatus: string;
  isPubliclyVisible: boolean;
  isReposted: boolean;
  hasSessionId: boolean;
};

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 10;

export default function GarageSalePaymentStatusBanner({
  saleId,
  initialPaymentStatus,
  initialListingStatus,
  isPubliclyVisible,
  isReposted,
  hasSessionId,
}: Props) {
  const router = useRouter();
  const [isConfirmed, setIsConfirmed] = useState(initialPaymentStatus === 'PAID' && isPubliclyVisible);
  const [attemptsExhausted, setAttemptsExhausted] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (isConfirmed) return;

    let isMounted = true;
    let attempts = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const canonicalUrl = `/garage-sales/${saleId}?payment=success${isReposted ? '&reposted=1' : ''}`;

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = undefined;
      }
    };

    const poll = async () => {
      attempts += 1;
      try {
        const res = await fetch(`/api/garage-sales/${saleId}`, { cache: 'no-cache' });
        if (!res.ok) {
          if (attempts >= MAX_POLL_ATTEMPTS && isMounted) {
            stopPolling();
            setAttemptsExhausted(true);
          }
          return;
        }

        const sale = await res.json();
        if (sale.paymentStatus === 'PAID' && sale.status === 'APPROVED') {
          if (!isMounted) return;
          stopPolling();
          setIsConfirmed(true);
          setAttemptsExhausted(false);
          router.replace(canonicalUrl);
          router.refresh();
          return;
        }
      } catch {
        // Retry on the next interval while Stripe/webhook settlement completes.
      }

      if (attempts >= MAX_POLL_ATTEMPTS && isMounted) {
        stopPolling();
        setAttemptsExhausted(true);
      }
    };

    void poll();
    interval = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      stopPolling();
    };
  }, [isConfirmed, isReposted, router, saleId]);

  const content = useMemo(() => {
    if (isConfirmed) {
      return {
        className: 'border-green-200 bg-green-50 text-green-900',
        title: isReposted ? 'Your garage sale repost is now live!' : 'Your garage sale is now live!',
        description: 'Payment confirmed. Your listing is active, public, and ready for buyers.',
      };
    }

    return {
      className: 'border-yellow-200 bg-yellow-50 text-yellow-900',
      title: hasSessionId ? 'Confirming payment…' : 'Payment confirmation pending',
      description: attemptsExhausted
        ? 'We are still waiting for Stripe confirmation. You can retry sync without leaving this page.'
        : `We are checking Stripe for the latest payment status. Current state: ${initialPaymentStatus} / ${initialListingStatus}.`,
    };
  }, [attemptsExhausted, hasSessionId, initialListingStatus, initialPaymentStatus, isConfirmed, isReposted]);

  const handleSyncPaymentStatus = async () => {
    setIsSyncing(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/sync-payment`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      const reason = typeof data?.reason === 'string' ? data.reason : 'sync_failed';
      if (!res.ok || !data?.ok) {
        if (reason === 'payment_not_paid') {
          setSyncError('Stripe has not marked this checkout as paid yet. Please try again shortly.');
          return;
        }
        setSyncError('Unable to sync payment right now. Please try again.');
        return;
      }
      setSyncMessage('Payment sync completed. Refreshing listing state…');
      router.refresh();
    } catch {
      setSyncError('Unable to sync payment right now. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className={`card border p-4 text-sm ${content.className}`}>
      <p className="font-semibold">{content.title}</p>
      <p className="mt-1">{content.description}</p>
      {!isConfirmed && (
        <>
          <button
            type="button"
            className="btn-outline mt-3 text-xs"
            onClick={handleSyncPaymentStatus}
            disabled={isSyncing}
          >
            {isSyncing ? 'Syncing…' : 'Sync Payment Status'}
          </button>
          {syncMessage && <p className="mt-2 text-xs text-green-700">{syncMessage}</p>}
          {syncError && <p className="mt-2 text-xs text-red-700">{syncError}</p>}
        </>
      )}
    </div>
  );
}
