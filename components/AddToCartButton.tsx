"use client";
import { useState } from 'react';
import { trackConversionEvent } from '@/lib/conversion-tracking';
import FloatingToast from '@/components/FloatingToast';

type Item = {
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

export default function AddToCartButton({
  item,
  requireVariantSelection = false,
}: {
  item: Omit<Item, 'quantity'>;
  requireVariantSelection?: boolean;
}) {
  const [done, setDone] = useState(false);
  const [capped, setCapped] = useState(false);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const maxQty = Math.min(item.inventoryQty, 99);

  function add() {
    if (requireVariantSelection && !item.productVariantId) {
      console.warn('[cart] add to cart blocked: missing variant selection', { productId: item.id });
      setError('Please choose a size before adding this item.');
      return;
    }
    setError('');
    const raw = localStorage.getItem('flupflap_cart');
    let cart: Item[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        cart = Array.isArray(parsed) ? parsed as Item[] : [];
      } catch {
        localStorage.removeItem('flupflap_cart');
      }
    }
    const existing = cart.find(i => i.id === item.id);
    if (existing) {
      const newQty = existing.quantity + qty;
      const clamped = Math.min(newQty, item.inventoryQty);
      const wasCapped = clamped < newQty;
      existing.quantity = clamped;
      existing.inventoryQty = item.inventoryQty;
      existing.shippingMode = item.shippingMode;
      existing.productVariantId = item.productVariantId;
      existing.sizeType = item.sizeType;
      existing.sizeLabel = item.sizeLabel;
      existing.waist = item.waist;
      existing.length = item.length;
      if (wasCapped) setCapped(true);
    } else {
      cart.push({ ...item, quantity: qty });
    }
    localStorage.setItem('flupflap_cart', JSON.stringify(cart));
    window.dispatchEvent(new Event('flupflap:cart-updated'));
    console.info('[cart] item added to cart', {
      productId: item.id,
      quantity: qty,
      variantId: item.productVariantId ?? null,
      resultingCartSize: cart.length,
    });
    void fetch('/api/cart/interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: item.id }),
      keepalive: true,
    }).catch(() => null);
    trackConversionEvent('add_to_cart', {
      product_id: item.id,
      quantity: qty,
      value: (item.priceCents * qty) / 100,
      currency: 'USD',
    });
    setDone(true);
    // Reset button label after 2 seconds
    setTimeout(() => { setDone(false); setCapped(false); }, 2000);
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <FloatingToast message={error} onDismiss={() => setError('')} />}
      <div className="flex items-center gap-2">
        <label htmlFor={`qty-${item.id}`} className="text-sm font-medium text-slate-700 flex-shrink-0">Qty:</label>
        <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden">
          <button
            type="button"
            className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 transition-colors text-lg leading-none"
            onClick={() => setQty(q => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <input
            id={`qty-${item.id}`}
            type="number"
            min={1}
            max={maxQty}
            value={qty}
            onChange={e => {
              const v = Math.min(maxQty, Math.max(1, parseInt(e.target.value, 10) || 1));
              setQty(v);
            }}
            className="w-14 text-center border-x border-slate-300 py-1.5 text-sm font-semibold focus:outline-none"
          />
          <button
            type="button"
            className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 transition-colors text-lg leading-none"
            onClick={() => setQty(q => Math.min(maxQty, q + 1))}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>
      <button onClick={add} className="btn-dark w-full">
        {done ? (capped ? `✓ Added (capped at ${item.inventoryQty} available)` : '✓ Added to cart') : 'Add to cart'}
      </button>
    </div>
  );
}
