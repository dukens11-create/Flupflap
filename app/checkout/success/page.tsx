import Link from 'next/link';
import ClearCart from '@/components/ClearCart';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Order Confirmed' };

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  return (
    <main className="max-w-md mx-auto text-center py-16">
      {/* Clear the cart from localStorage after a successful purchase */}
      <ClearCart />
      <div className="card p-10">
        <p className="text-5xl mb-4">🎉</p>
        <h1 className="text-3xl font-black mb-2">Order confirmed!</h1>
        <p className="text-slate-500 mb-6">
          Thanks for your purchase. You&apos;ll receive a confirmation email shortly and a tracking number once your item ships.
        </p>
        {session_id && (
          <p className="text-xs font-mono text-slate-400 mb-6 break-all">
            Ref: {session_id}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <Link href="/orders" className="btn-primary">View my orders</Link>
          <Link href="/" className="btn-outline">Continue shopping</Link>
        </div>
      </div>
    </main>
  );
}

