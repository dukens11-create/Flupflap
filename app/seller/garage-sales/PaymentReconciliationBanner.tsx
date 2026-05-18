'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type ReconcileState = 'PAYMENT_PENDING' | 'PENDING_REVIEW' | 'REJECTED' | 'PAYMENT_FAILED' | 'PAYMENT_REFUNDED' | 'HIDDEN' | 'EXPIRED' | 'LIVE' | 'OPEN' | 'UPCOMING';

type Props = {
  saleId: string;
  checkoutSessionId?: string;
  initialState?: string;
  initialOwnerMessage?: string;
};

const MAX_POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 3000;

export default function PaymentReconciliationBanner({
  saleId,
  checkoutSessionId,
  initialState,
  initialOwnerMessage,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<string | undefined>(initialState);
  const [ownerMessage, setOwnerMessage] = useState<string | undefined>(initialOwnerMessage);
  const [isPolling, setIsPolling] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const didShowLiveState = useRef(initialState === 'LIVE' || initialState === 'OPEN' || initialState === 'UPCOMING');

  const isLive = state === 'LIVE' || state === 'OPEN' || state === 'UPCOMING';
  const isPending = !state || state === 'PAYMENT_PENDING';

  const reconcile = useCallback(async (manual = false) => {
    setIsPolling(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/garage-sales/${encodeURIComponent(saleId)}/payment-reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutSessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Unable to confirm payment right now.');
      }
      const nextState = data.state as ReconcileState | undefined;
      setState(nextState);
      setOwnerMessage(data.ownerMessage as string | undefined);
      if (nextState && nextState !== 'PAYMENT_PENDING') {
        router.refresh();
      }
      if (manual && nextState === 'PAYMENT_PENDING') {
        setSyncError('Still confirming payment. Please try again in a few seconds.');
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Unable to confirm payment right now.');
    } finally {
      setIsPolling(false);
    }
  }, [checkoutSessionId, router, saleId]);

  useEffect(() => {
    if (state !== 'PAYMENT_PENDING') return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      void reconcile(false);
      if (attempts >= MAX_POLL_ATTEMPTS) {
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [reconcile, state]);

  useEffect(() => {
    if (!isLive || didShowLiveState.current) return;
    didShowLiveState.current = true;
    router.replace(`/seller/garage-sales?paid=1&saleId=${encodeURIComponent(saleId)}`);
  }, [isLive, router, saleId]);

  const toneClass = useMemo(() => {
    if (isLive) return 'border-green-200 bg-green-50 text-green-900';
    if (isPending) return 'border-blue-200 bg-blue-50 text-blue-900';
    return 'border-yellow-200 bg-yellow-50 text-yellow-900';
  }, [isLive, isPending]);

  return (
    <div className={`card space-y-2 p-4 text-sm ${toneClass}`} role="status" aria-live="polite">
      {isLive ? (
        <p className="font-semibold">Your garage sale is now live!</p>
      ) : isPending ? (
        <p className="font-semibold">Confirming payment…</p>
      ) : (
        <p className="font-semibold">Payment update received.</p>
      )}
      {ownerMessage && <p>{ownerMessage}</p>}
      {(isPending || syncError) && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void reconcile(true)}
            disabled={isPolling}
            className="btn-outline px-3 py-1.5 text-xs"
          >
            {isPolling ? 'Checking…' : 'Retry sync'}
          </button>
          {syncError && <span className="text-xs text-red-700">{syncError}</span>}
        </div>
      )}
    </div>
  );
}
