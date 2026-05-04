import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Checkout Cancelled' };

export default function CheckoutCancelPage() {
  return (
    <main className="max-w-md mx-auto text-center py-16">
      <div className="card p-10">
        <p className="text-5xl mb-4">😕</p>
        <h1 className="text-3xl font-black mb-2">Checkout cancelled</h1>
        <p className="text-slate-500 mb-6">
          Your order was not placed. Your cart is still saved — you can review it and try again anytime.
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/cart" className="btn-primary">Back to cart</Link>
          <Link href="/" className="btn-outline">Continue shopping</Link>
        </div>
      </div>
    </main>
  );
}
