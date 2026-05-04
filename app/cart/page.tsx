import CartClient from '@/components/CartClient';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Your Cart' };

export default function CartPage() {
  return (
    <main className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-black mb-2">Your Cart</h1>
      <CartClient />
    </main>
  );
}
