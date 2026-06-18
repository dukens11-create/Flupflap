"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { trackConversionEvent } from '@/lib/conversion-tracking';
import FloatingToast from '@/components/FloatingToast';

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

  function trackCheckoutStarted() {
    trackConversionEvent('checkout_started', {
      product_id: productId,
      quantity: 1,
      value: (checkoutItem?.priceCents ?? 0) / 100,
      currency: 'USD',
    });
  }

  async function handle() {
    if (loading) return;
    setError('');
    if (requireVariantSelection && !checkoutItem?.productVariantId) {
      console.warn('[buy-now] blocked: missing variant selection', { productId });
      setError('Please choose a size before continuing.');
      return;
    }
    if (requiresLiveShipping(checkoutItem, isPickup) && checkoutItem) {
      const checkoutCart: BuyNowCartItem[] = [{ ...checkoutItem, quantity: 1 }];
      localStorage.setItem('flupflap_cart', JSON.stringify(checkoutCart));
      window.dispatchEvent(new Event('flupflap:cart-updated'));
      console.info('[buy-now] rerouting to checkout for live shipping', {
        productId,
        variantId: checkoutItem.productVariantId ?? null,
      });
      trackCheckoutStarted();
      router.push('/checkout');
      return;
    }

    setLoading(true);
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
        console.info('[buy-now] Stripe checkout session created', {
          productId,
          isPickup,
          variantId: checkoutItem?.productVariantId ?? null,
        });
        trackCheckoutStarted();
        location.href = data.url;
        return;
      }
      console.error('[buy-now] checkout session request failed', {
        productId,
        isPickup,
        status: res.status,
        error: data.error ?? 'Unknown checkout error',
      });
      setError(data.error || 'Checkout failed. Please try again.');
    } catch (err) {
      console.error('[buy-now] network error creating checkout session', {
        productId,
        isPickup,
        error: err instanceof Error ? err.message : String(err),
      });
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <FloatingToast message={error} onDismiss={() => setError('')} />}
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
