"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type BuyNowCartItem = {
  id: string;
  title: string;
  priceCents: number;
  imageUrl: string;
  shippingCents: number;
  shippingMode?: string;
  quantity: number;
  inventoryQty: number;
  pickupAvailable?: boolean;
  pickupCity?: string;
  pickupState?: string;
};

interface Props {
  productId: string;
  checkoutItem?: Omit<BuyNowCartItem, 'quantity'>;
  isPickup?: boolean;
}

function requiresLiveShipping(item?: Omit<BuyNowCartItem, 'quantity'>, isPickup?: boolean) {
  if (!item || isPickup) return false;
  // Legacy products may have shippingMode unset with shippingCents=0; treat those as calculated shipping.
  return item.shippingMode === 'CALCULATED' || (!item.shippingMode && item.shippingCents === 0);
}

export default function BuyNowButton({ productId, checkoutItem, isPickup = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handle() {
    if (loading) return;
    setError('');
    if (requiresLiveShipping(checkoutItem, isPickup) && checkoutItem) {
      const checkoutCart: BuyNowCartItem[] = [{ ...checkoutItem, quantity: 1 }];
      localStorage.setItem('flupflap_cart', JSON.stringify(checkoutCart));
      window.dispatchEvent(new Event('flupflap:cart-updated'));
      router.push('/checkout');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/checkout/buynow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, isPickup }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof (data as { url?: unknown }).url === 'string') {
        location.href = (data as { url: string }).url;
        return;
      }
      setError((data as { error?: string }).error || 'Checkout failed. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          ⚠ {error}
        </p>
      )}
      <button onClick={handle} disabled={loading} className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed">
        {loading
          ? 'Redirecting…'
          : isPickup
            ? '🏠 Buy now — Pick up locally'
            : 'Buy now'}
      </button>
    </div>
  );
}
