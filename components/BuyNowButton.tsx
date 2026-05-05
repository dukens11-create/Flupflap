"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  productId: string;
  isPickup?: boolean;
}

export default function BuyNowButton({ productId, isPickup = false }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handle() {
    setLoading(true);
    const res = await fetch('/api/checkout/buynow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, isPickup }),
    });
    const data = await res.json();
    if (data.url) {
      location.href = data.url;
    } else {
      alert(data.error || 'Checkout failed');
      setLoading(false);
    }
  }

  return (
    <button onClick={handle} disabled={loading} className="btn-primary w-full">
      {loading
        ? 'Redirecting…'
        : isPickup
          ? '🏠 Buy now — Pick up locally'
          : 'Buy now'}
    </button>
  );
}
