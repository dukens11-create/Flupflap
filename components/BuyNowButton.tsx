"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BuyNowButton({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handle() {
    setLoading(true);
    const res = await fetch('/api/checkout/buynow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId }),
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
      {loading ? 'Redirecting…' : 'Buy now'}
    </button>
  );
}
