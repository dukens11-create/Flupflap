'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  saleId: string;
};

type CancelPaymentResponse = {
  error?: string;
};

const CONFIRM_MESSAGE = 'Cancel this pending payment and remove this garage sale listing?';

export default function SellerGarageSaleCancelPaymentButton({ saleId }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancelPayment() {
    if (!window.confirm(CONFIRM_MESSAGE)) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/garage-sales/${saleId}/cancel-payment`, { method: 'POST' });
      const payload = await response.json().catch(() => ({})) as CancelPaymentResponse;
      if (!response.ok) {
        setError(payload.error ?? 'Unable to cancel pending payment.');
        return;
      }
      router.push('/seller/garage-sales?cancelled=1');
    } catch {
      setError('Unable to cancel pending payment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-outline text-xs"
        onClick={handleCancelPayment}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Cancelling...' : 'Cancel Payment'}
      </button>
      {error && (
        <p className="w-full text-xs text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
