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
  return item.shippingMode === 'CALCULATED' || (!item.shippingMode && item.shippingCents === 0);
}

export default function BuyNowButton({ productId, checkoutItem, isPickup = false }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handle() {
    if (requiresLiveShipping(checkoutItem, isPickup) && checkoutItem) {
      const checkoutCart: BuyNowCartItem[] = [{ ...checkoutItem, quantity: 1 }];
      localStorage.setItem('flupflap_cart', JSON.stringify(checkoutCart));
      window.dispatchEvent(new Event('flupflap:cart-updated'));
      router.push('/checkout');
      return;
    }

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
