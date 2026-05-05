"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  productId: string;
  pickupAvailable?: boolean;
  pickupCity?: string | null;
  pickupState?: string | null;
}

export default function BuyNowButton({ productId, pickupAvailable, pickupCity, pickupState }: Props) {
  const [loading, setLoading] = useState<'ship' | 'pickup' | null>(null);
  const router = useRouter();

  async function handle(fulfillmentType: 'SHIPPING' | 'PICKUP') {
    setLoading(fulfillmentType === 'SHIPPING' ? 'ship' : 'pickup');
    const res = await fetch('/api/checkout/buynow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, fulfillmentType }),
    });
    const data = await res.json();
    if (data.url) {
      location.href = data.url;
    } else {
      alert(data.error || 'Checkout failed');
      setLoading(null);
    }
  }

  const pickupLabel = [pickupCity, pickupState].filter(Boolean).join(', ');

  if (pickupAvailable) {
    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={() => handle('SHIPPING')}
          disabled={loading !== null}
          className="btn-primary w-full"
        >
          {loading === 'ship' ? 'Redirecting…' : '🚚 Buy now — Ship it'}
        </button>
        <button
          onClick={() => handle('PICKUP')}
          disabled={loading !== null}
          className="btn-dark w-full"
        >
          {loading === 'pickup'
            ? 'Redirecting…'
            : pickupLabel
              ? `📍 Buy now — Pick up in ${pickupLabel}`
              : '📍 Buy now — Local pickup'}
        </button>
        <p className="text-xs text-slate-400 text-center">
          Pickup: you&apos;ll get a 6-digit code to show the seller at handoff.
        </p>
      </div>
    );
  }

  return (
    <button onClick={() => handle('SHIPPING')} disabled={loading !== null} className="btn-primary w-full">
      {loading ? 'Redirecting…' : 'Buy now'}
    </button>
  );
}

