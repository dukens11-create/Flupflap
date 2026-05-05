"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface CartItem {
  id: string;
  title: string;
  priceCents: number;
  shippingCents: number;
  imageUrl: string;
  quantity: number;
  pickupAvailable?: boolean;
  pickupCity?: string;
  pickupState?: string;
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CheckoutPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  // Track which items the buyer chose pickup for (item id → true = pickup)
  const [pickupChoices, setPickupChoices] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      setItems(JSON.parse(localStorage.getItem('flupflap_cart') || '[]'));
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  // Items that support pickup
  const pickupEligibleIds = useMemo(
    () => new Set(items.filter(i => i.pickupAvailable).map(i => i.id)),
    [items],
  );

  const isPickup = useCallback(
    (itemId: string): boolean => pickupEligibleIds.has(itemId) && !!pickupChoices[itemId],
    [pickupEligibleIds, pickupChoices],
  );

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.priceCents * i.quantity, 0),
    [items],
  );
  const shipping = useMemo(
    () =>
      items.reduce((s, i) => {
        // Skip shipping for items buyer chose to pick up
        if (isPickup(i.id)) return s;
        return s + i.shippingCents * i.quantity;
      }, 0),
    [items, isPickup],
  );
  const total = subtotal + shipping;

  const pickupItemIds = useMemo(
    () => items.filter(i => isPickup(i.id)).map(i => i.id),
    [items, isPickup],
  );

  async function handleCheckout() {
    if (!session?.user) {
      router.push('/login?callbackUrl=/checkout');
      return;
    }
    setChecking(true);
    setError('');
    try {
      const res = await fetch('/api/checkout/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ productId: i.id, quantity: i.quantity })),
          pickupItemIds,
        }),
      });
      const data = await res.json();
      if (data.url) {
        // Stripe checkout requires a full page navigation to an external URL
        window.location.href = data.url;
      } else if (res.status === 401) {
        router.push('/login?callbackUrl=/checkout');
      } else {
        setError(data.error || 'Checkout failed. Please try again.');
        setChecking(false);
      }
    } catch {
      setError('Network error. Please try again.');
      setChecking(false);
    }
  }

  if (loading || status === 'loading') {
    return (
      <main className="max-w-2xl mx-auto">
        <div className="card p-8 animate-pulse bg-slate-100 rounded-2xl h-64" />
      </main>
    );
  }

  if (!items.length) {
    return (
      <main className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-black mb-6">Checkout</h1>
        <div className="card p-10 text-center text-slate-500">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-medium mb-4">Your cart is empty.</p>
          <Link href="/" className="btn-primary">Browse products</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-black mb-6">Review your order</h1>

      {!session?.user && (
        <div className="card p-4 mb-4 bg-yellow-50 border-yellow-200 text-yellow-800 text-sm">
          <span>You&apos;ll need to </span>
          <Link href="/login?callbackUrl=/checkout" className="font-semibold underline">sign in</Link>
          <span> before completing your purchase.</span>
        </div>
      )}

      <div className="card p-5 mb-4 space-y-4">
        {items.map(item => (
          <div key={item.id}>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.title}
                className="w-14 h-14 object-cover rounded-lg flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.title}</p>
                <p className="text-sm text-slate-500">
                  {dollars(item.priceCents)} × {item.quantity}
                  {!isPickup(item.id) && item.shippingCents > 0 && (
                    <span> · {dollars(item.shippingCents)} shipping</span>
                  )}
                  {isPickup(item.id) && (
                    <span className="text-green-700 font-medium"> · Free pickup</span>
                  )}
                </p>
              </div>
              <p className="font-semibold flex-shrink-0">
                {dollars((item.priceCents + (isPickup(item.id) ? 0 : item.shippingCents)) * item.quantity)}
              </p>
            </div>
            {/* Pickup / delivery selector */}
            {pickupEligibleIds.has(item.id) && (
              <div className="mt-2 flex gap-3 text-sm pl-[68px]">
                <span className="text-slate-500 text-xs mr-1">Fulfillment:</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name={`fulfillment-${item.id}`}
                    checked={!isPickup(item.id)}
                    onChange={() => setPickupChoices(prev => ({ ...prev, [item.id]: false }))}
                  />
                  <span>Delivery</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-green-700">
                  <input
                    type="radio"
                    name={`fulfillment-${item.id}`}
                    checked={isPickup(item.id)}
                    onChange={() => setPickupChoices(prev => ({ ...prev, [item.id]: true }))}
                  />
                  <span>
                    🏠 Pick up{item.pickupCity && item.pickupState ? ` in ${item.pickupCity}, ${item.pickupState}` : ''}
                  </span>
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card p-5 mb-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Subtotal</span>
          <span>{dollars(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Shipping</span>
          <span>{shipping > 0 ? dollars(shipping) : 'Free'}</span>
        </div>
        <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
          <span>Total</span>
          <span>{dollars(total)}</span>
        </div>
      </div>

      {pickupItemIds.length > 0 && pickupItemIds.length === items.length ? (
        <p className="text-xs text-slate-500 mb-3">
          All items will be picked up in person. No shipping address needed. You will be redirected to Stripe to complete payment.
        </p>
      ) : (
        <p className="text-xs text-slate-500 mb-3">
          You will be redirected to Stripe to complete your payment securely. Shipping address is collected at checkout.
        </p>
      )}

      {error && (
        <p className="text-red-600 text-sm mb-3">{error}</p>
      )}

      <div className="flex gap-3">
        <Link href="/cart" className="btn-outline flex-1 text-center">
          ← Back to cart
        </Link>
        <button
          onClick={handleCheckout}
          disabled={checking}
          className="btn-primary flex-1"
        >
          {checking ? 'Redirecting to payment…' : 'Proceed to payment →'}
        </button>
      </div>
    </main>
  );
}
