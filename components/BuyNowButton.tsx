"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { trackConversionEvent } from '@/lib/conversion-tracking';

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
  productVariantId?: string;
  sizeType?: string;
  sizeLabel?: string;
  waist?: string;
  length?: string;
};

interface Props {
  productId: string;
  checkoutItem?: Omit<BuyNowCartItem, 'quantity'>;
  isPickup?: boolean;
  requireVariantSelection?: boolean;
}
type CheckoutResponse = { url?: string; error?: string };

function requiresLiveShipping(item?: Omit<BuyNowCartItem, 'quantity'>, isPickup?: boolean) {
  if (!item || isPickup) return false;
  // Legacy products may have shippingMode unset with shippingCents=0; treat those as calculated shipping.
  return item.shippingMode === 'CALCULATED' || (!item.shippingMode && item.shippingCents === 0);
}

export default function BuyNowButton({ productId, checkoutItem, isPickup = false, requireVariantSelection = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handle() {
    if (loading) return;
    setError('');
    if (requireVariantSelection && !checkoutItem?.productVariantId) {
      setError('Please choose a size before continuing.');
      return;
    }
    if (requiresLiveShipping(checkoutItem, isPickup) && checkoutItem) {
      const checkoutCart: BuyNowCartItem[] = [{ ...checkoutItem, quantity: 1 }];
      localStorage.setItem('flupflap_cart', JSON.stringify(checkoutCart));
      window.dispatchEvent(new Event('flupflap:cart-updated'));
      trackConversionEvent('checkout_started', {
        product_id: productId,
        quantity: 1,
        value: checkoutItem.priceCents / 100,
        currency: 'USD',
      });
      router.push('/checkout');
      return;
    }

    setLoading(true);
    trackConversionEvent('checkout_started', {
      product_id: productId,
      quantity: 1,
      value: (checkoutItem?.priceCents ?? 0) / 100,
      currency: 'USD',
    });
    try {
      const res = await fetch('/api/checkout/buynow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, isPickup, productVariantId: checkoutItem?.productVariantId }),
      });
      let data: CheckoutResponse = {};
      try {
        data = await res.json();
      } catch (parseErr) {
        console.warn('[buy-now] Unable to parse checkout response JSON', parseErr);
        Sentry.captureException(parseErr, {
          tags: { area: 'checkout', action: 'buynow_response_parse' },
          extra: { productId, isPickup, status: res.status },
        });
      }
      if (res.ok && typeof data.url === 'string') {
        location.href = data.url;
        return;
      }
      setError(data.error || 'Checkout failed. Please try again.');
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
