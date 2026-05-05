"use client";
import { useState } from 'react';

type Item = {
  id: string;
  title: string;
  priceCents: number;
  imageUrl: string;
  shippingCents: number;
  quantity: number;
  isPickup?: boolean;
  pickupAvailable?: boolean;
  pickupCity?: string;
  pickupState?: string;
};

export default function AddToCartButton({ item }: { item: Omit<Item, 'quantity' | 'isPickup'> }) {
  const [done, setDone] = useState(false);
  const [pickup, setPickup] = useState(false);

  function add() {
    const raw = localStorage.getItem('flupflap_cart');
    const cart: Item[] = raw ? JSON.parse(raw) : [];
    const existing = cart.find(i => i.id === item.id);
    if (existing) {
      existing.quantity += 1;
      existing.isPickup = pickup;
    } else {
      cart.push({ ...item, quantity: 1, isPickup: pickup });
    }
    localStorage.setItem('flupflap_cart', JSON.stringify(cart));
    window.dispatchEvent(new Event('flupflap:cart-updated'));
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2">
      {item.pickupAvailable && (
        <div className="flex rounded-xl overflow-hidden border border-slate-300 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setPickup(false)}
            className={`flex-1 px-3 py-2 transition-colors ${!pickup ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            🚚 Ship
          </button>
          <button
            type="button"
            onClick={() => setPickup(true)}
            className={`flex-1 px-3 py-2 transition-colors ${pickup ? 'bg-green-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            📍 Pick up
          </button>
        </div>
      )}
      <button onClick={add} className="btn-dark w-full">
        {done ? '✓ Added to cart' : 'Add to cart'}
      </button>
    </div>
  );
}

