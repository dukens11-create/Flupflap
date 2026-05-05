import Link from 'next/link';
import ClearCart from '@/components/ClearCart';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Order Confirmed' };

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  // Determine if this was a pickup order by checking the order record
  let isPickup = false;
  let pickupCode: string | null = null;
  if (session_id) {
    try {
      const order = await prisma.order.findUnique({
        where: { stripeCheckoutId: session_id },
        select: { fulfillmentType: true, pickupCode: true },
      });
      isPickup = order?.fulfillmentType === 'PICKUP';
      pickupCode = order?.pickupCode ?? null;
    } catch {
      // Not critical — fall back to generic message
    }
  }

  return (
    <main className="max-w-md mx-auto text-center py-16">
      {/* Clear the cart from localStorage after a successful purchase */}
      <ClearCart />
      <div className="card p-10">
        <p className="text-5xl mb-4">{isPickup ? '📍' : '🎉'}</p>
        <h1 className="text-3xl font-black mb-2">Order confirmed!</h1>
        {isPickup ? (
          <>
            <p className="text-slate-500 mb-4">
              Thanks for your purchase. This is a <strong>local pickup order</strong>.
              Coordinate with the seller to arrange a handoff time.
            </p>
            {pickupCode && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p className="text-sm font-semibold text-blue-800 mb-2">Your pickup code</p>
                <p className="font-mono text-3xl font-black tracking-[0.25em] text-blue-900">
                  {pickupCode}
                </p>
                <p className="text-xs text-blue-600 mt-2">
                  Show this to the seller at handoff. You can also find it in your order details.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-slate-500 mb-6">
            Thanks for your purchase. You&apos;ll receive a confirmation email shortly and a tracking number once your item ships.
          </p>
        )}
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

