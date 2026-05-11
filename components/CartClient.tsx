"use client";
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dollars } from '@/lib/money';
import Image from 'next/image';

type Item = {
  id: string;
  title: string;
  priceCents: number;
  imageUrl: string;
  shippingCents: number;
  quantity: number;
  inventoryQty?: number;
};

export default function CartClient() {
  const [items, setItems] = useState<Item[]>([]);
  const router = useRouter();

  useEffect(() => {
    setItems(JSON.parse(localStorage.getItem('flupflap_cart') || '[]'));
  }, []);

  function save(next: Item[]) {
    setItems(next);
    localStorage.setItem('flupflap_cart', JSON.stringify(next));
    window.dispatchEvent(new Event('flupflap:cart-updated'));
  }

  const total = useMemo(
    () => items.reduce((s, i) => s + (i.priceCents + i.shippingCents) * i.quantity, 0),
    [items]
  );

  if (!items.length) {
    return (
      <div className="card p-8 mt-6 text-center text-slate-500">
        <p className="text-2xl mb-2">🛒</p>
        <p className="font-medium mb-4">Your cart is empty.</p>
        <a href="/" className="btn-primary">Browse products</a>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {items.map(i => (
        <div className="card p-4 flex gap-4 items-center" key={i.id}>
          <div className="relative w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-slate-100">
            <Image src={i.imageUrl} alt={i.title} fill className="object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{i.title}</p>
            <p className="text-sm text-slate-500">
              {dollars(i.priceCents)} + {dollars(i.shippingCents)} shipping
            </p>
          </div>
          <div className="flex gap-2 items-center flex-shrink-0">
            <button
              className="btn border w-8 h-8 p-0"
              onClick={() =>
                save(items.map(x => x.id === i.id ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))
              }
            >
              −
            </button>
            <span className="w-6 text-center font-medium">{i.quantity}</span>
            <button
              className="btn border w-8 h-8 p-0"
              onClick={() =>
                save(items.map(x => x.id === i.id ? { ...x, quantity: Math.min(x.quantity + 1, x.inventoryQty ?? 9999) } : x))
              }
            >
              +
            </button>
            <button
              className="btn bg-red-100 hover:bg-red-200 text-red-700 text-xs px-2"
              onClick={() => save(items.filter(x => x.id !== i.id))}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <div className="card p-6 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <p className="text-lg font-black">Total: {dollars(total)}</p>
          <p className="text-xs text-slate-500">Includes item prices and shipping</p>
        </div>
        <button onClick={() => router.push('/checkout')} className="btn-primary min-w-[140px]" aria-label="Review order and proceed to checkout">
          Review order →
        </button>
      </div>
    </div>
  );
}

