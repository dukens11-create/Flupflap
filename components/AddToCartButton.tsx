"use client";
import { useState } from 'react';

type Item = {
  id: string;
  title: string;
  priceCents: number;
  imageUrl: string;
  shippingCents: number;
  quantity: number;
  inventoryQty: number;
  pickupAvailable?: boolean;
  pickupCity?: string;
  pickupState?: string;
};

export default function AddToCartButton({ item }: { item: Omit<Item, 'quantity'> }) {
  const [done, setDone] = useState(false);
  const [qty, setQty] = useState(1);
  const maxQty = Math.min(item.inventoryQty, 99);

  function add() {
    const raw = localStorage.getItem('flupflap_cart');
    const cart: Item[] = raw ? JSON.parse(raw) : [];
    const existing = cart.find(i => i.id === item.id);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + qty, item.inventoryQty);
      existing.inventoryQty = item.inventoryQty;
    } else {
      cart.push({ ...item, quantity: qty });
    }
    localStorage.setItem('flupflap_cart', JSON.stringify(cart));
    window.dispatchEvent(new Event('flupflap:cart-updated'));
    void fetch('/api/cart/interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: item.id }),
      keepalive: true,
    }).catch(() => null);
    setDone(true);
    // Reset button label after 2 seconds
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2">
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
        {done ? '✓ Added to cart' : 'Add to cart'}
      </button>
    </div>
  );
}
