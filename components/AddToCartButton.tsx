"use client";
import { useState } from 'react';

type Item = {
  id: string;
  title: string;
  priceCents: number;
  imageUrl: string;
  shippingCents: number;
  quantity: number;
  pickupAvailable?: boolean;
  pickupCity?: string;
  pickupState?: string;
};

export default function AddToCartButton({ item }: { item: Omit<Item, 'quantity'> }) {
  const [done, setDone] = useState(false);

  function add() {
    const raw = localStorage.getItem('flupflap_cart');
    const cart: Item[] = raw ? JSON.parse(raw) : [];
    const existing = cart.find(i => i.id === item.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({ ...item, quantity: 1 });
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
    <button onClick={add} className="btn-dark w-full">
      {done ? '✓ Added to cart' : 'Add to cart'}
    </button>
  );
}
