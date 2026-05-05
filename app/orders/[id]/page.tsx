import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Order Details' };

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
  READY_FOR_PICKUP: 'Ready for Pickup',
  PICKED_UP: 'Picked Up',
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'badge-yellow',
    PAID: 'badge-blue',
    SHIPPED: 'badge-green',
    DELIVERED: 'badge-green',
    CANCELLED: 'badge-red',
    REFUNDED: 'badge-slate',
    READY_FOR_PICKUP: 'badge-yellow',
    PICKED_UP: 'badge-green',
  };
  return map[status] ?? 'badge-slate';
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: {
      id,
      ...(session.user.role !== 'ADMIN' && { buyerId: session.user.id }),
    },
    include: {
      buyer: { select: { name: true, email: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
              seller: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!order) notFound();

  const isPickup = order.fulfillmentType === 'PICKUP';

  return (
    <main className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/orders" className="text-sm text-slate-500 hover:text-blue-600">← My Orders</Link>
      </div>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black">Order #{order.id.slice(-8).toUpperCase()}</h1>
          <p className="text-sm text-slate-500">{new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          {isPickup && (
            <p className="text-sm text-green-700 font-medium mt-1">📍 Local pickup order</p>
          )}
        </div>
        <span className={`badge ${statusBadge(order.status)}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>

      {/* Pickup code (shown to buyer for pickup orders) */}
      {isPickup && order.pickupCode && order.status !== 'PICKED_UP' && order.status !== 'CANCELLED' && (
        <div className="card p-5 mb-4 bg-blue-50 border-blue-200">
          <h2 className="font-bold mb-2 text-blue-900">📱 Your pickup code</h2>
          <p className="text-xs text-blue-700 mb-3">
            Show this code to the seller when you pick up your item. The seller will enter it to confirm the handoff.
          </p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-4xl font-black tracking-[0.25em] text-blue-800 bg-white border border-blue-200 rounded-xl px-5 py-3 select-all">
              {order.pickupCode}
            </span>
          </div>
          <p className="text-xs text-blue-500 mt-3">
            This code is unique to your order. Do not share it until you are ready to receive the item.
          </p>
        </div>
      )}

      {isPickup && order.status === 'PICKED_UP' && (
        <div className="card p-4 mb-4 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Pickup confirmed
          {order.pickupConfirmedAt && (
            <span className="text-green-600"> · {new Date(order.pickupConfirmedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          )}
        </div>
      )}

      {/* Items */}
      <div className="card p-5 mb-4">
        <h2 className="font-bold mb-3">Items ordered</h2>
        <div className="space-y-3">
          {order.items.map(item => (
            <div key={item.id} className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.product.imageUrl}
                alt={item.product.title}
                className="w-14 h-14 object-cover rounded-lg flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <Link href={`/products/${item.product.id}`} className="font-medium hover:text-blue-600 truncate block">
                  {item.product.title}
                </Link>
                <p className="text-xs text-slate-500">
                  Sold by {item.product.seller.name} · Qty: {item.quantity}
                </p>
              </div>
              <p className="font-semibold flex-shrink-0">{dollars(item.priceCents * item.quantity)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Price breakdown */}
      <div className="card p-5 mb-4 space-y-2 text-sm">
        <h2 className="font-bold mb-1">Payment summary</h2>
        <div className="flex justify-between">
          <span className="text-slate-500">Subtotal</span>
          <span>{dollars(order.subtotalCents ?? order.totalCents)}</span>
        </div>
        {isPickup ? (
          <div className="flex justify-between">
            <span className="text-slate-500">Shipping</span>
            <span className="text-green-600 font-medium">Free (pickup)</span>
          </div>
        ) : order.shippingCents > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-500">Shipping</span>
            <span>{dollars(order.shippingCents)}</span>
          </div>
        )}
        {order.taxCents > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-500">Tax</span>
            <span>{dollars(order.taxCents)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base border-t pt-2">
          <span>Total</span>
          <span>{dollars(order.totalCents)}</span>
        </div>
      </div>

      {/* Shipping info — only for non-pickup orders */}
      {!isPickup && (order.shippingName || order.shippingLine1) && (
        <div className="card p-5 mb-4">
          <h2 className="font-bold mb-2">Shipping address</h2>
          <address className="not-italic text-sm text-slate-600 space-y-0.5">
            {order.shippingName && <p>{order.shippingName}</p>}
            {order.shippingLine1 && <p>{order.shippingLine1}</p>}
            {order.shippingLine2 && <p>{order.shippingLine2}</p>}
            {(order.shippingCity || order.shippingState || order.shippingPostalCode) && (
              <p>
                {[order.shippingCity, order.shippingState, order.shippingPostalCode]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
            {order.shippingCountry && <p>{order.shippingCountry}</p>}
          </address>
        </div>
      )}

      {/* Tracking info — only for non-pickup orders */}
      {!isPickup && order.trackingNumber && (
        <div className="card p-5 mb-4">
          <h2 className="font-bold mb-2">Tracking</h2>
          <p className="text-sm text-slate-600">
            📦 {order.shippingCarrier && <strong>{order.shippingCarrier}: </strong>}
            {order.trackingNumber}
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <Link href="/orders" className="btn-outline flex-1 text-center">← Back to orders</Link>
        <Link href="/" className="btn-primary flex-1 text-center">Continue shopping</Link>
      </div>
    </main>
  );
}
