import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import { getStoredLineSubtotalCents } from '@/lib/commission';
import { buildTrackingUrl } from '@/lib/shipping';
import Link from 'next/link';
import type { Metadata } from 'next';
import OrderRefundRequestCard from '@/components/OrderRefundRequestCard';
import MarkDeliveredButton from '@/components/MarkDeliveredButton';
import { ORDER_STATUS_LABELS, getOrderStatusBadgeClass } from '@/lib/order-status';

export const metadata: Metadata = { title: 'Order Details' };

function statusBadge(status: string) {
  return getOrderStatusBadgeClass(status);
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
      refundRequest: {
        select: {
          id: true,
          status: true,
          reason: true,
          details: true,
          requestedAmountCents: true,
          approvedAmountCents: true,
          adminNotes: true,
          sellerResponse: true,
          stripeRefundId: true,
          createdAt: true,
          updatedAt: true,
          resolvedAt: true,
        },
      },
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
  const trackingUrl = order.trackingUrl ?? buildTrackingUrl(order.carrier ?? order.shippingCarrier, order.trackingNumber);
  const refundRequest = order.refundRequest
    ? {
        ...order.refundRequest,
        createdAt: order.refundRequest.createdAt.toISOString(),
        updatedAt: order.refundRequest.updatedAt.toISOString(),
        resolvedAt: order.refundRequest.resolvedAt?.toISOString() ?? null,
      }
    : null;

  return (
    <main className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/orders" className="text-sm text-slate-500 hover:text-blue-600">← My Orders</Link>
      </div>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black">Order #{order.id.slice(-8).toUpperCase()}</h1>
          <p className="text-sm text-slate-500">{new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <span className={`badge ${statusBadge(order.status)}`}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
      </div>

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
                className="h-14 w-14 flex-shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1"
              />
              <div className="flex-1 min-w-0">
                <Link href={`/products/${item.product.id}`} className="font-medium hover:text-blue-600 truncate block">
                  {item.product.title}
                </Link>
                <p className="text-xs text-slate-500">
                  Sold by {item.product.seller.name} · {dollars(item.priceCents)} each · Qty: {item.quantity}
                </p>
              </div>
              <p className="font-semibold flex-shrink-0">{dollars(getStoredLineSubtotalCents(item))}</p>
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
        {order.shippingCents > 0 && (
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

      <OrderRefundRequestCard
        orderId={order.id}
        orderStatus={order.status}
        totalCents={order.totalCents}
        initialRefundRequest={refundRequest}
      />

      {/* Pickup info */}
      {order.isPickup && (
        <div className="card p-5 mb-4 bg-green-50 border-green-200">
          <h2 className="font-bold mb-2 text-green-800">🏠 Local Pickup Order</h2>
          <p className="text-sm text-green-700 mb-1">
            This order is marked for local pickup — no shipping is required.
          </p>
          {(order.pickupCity || order.pickupState) && (
            <p className="text-sm text-green-700 mb-2">
              Pickup location: <span className="font-medium">{[order.pickupCity, order.pickupState].filter(Boolean).join(', ')}</span>
            </p>
          )}
          {order.status === 'PICKED_UP' ? (
            <div className="mt-2 p-3 bg-green-100 rounded-xl">
              <p className="text-sm font-semibold text-green-800">✅ Pickup confirmed</p>
              {order.pickupConfirmedAt && (
                <p className="text-xs text-green-700 mt-0.5">
                  Confirmed on {new Date(order.pickupConfirmedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>
          ) : order.pickupCode ? (
            <div className="mt-2 p-3 bg-white border border-green-200 rounded-xl">
              <p className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-1">Your pickup code</p>
              <p className="text-3xl font-black tracking-widest text-slate-900">{order.pickupCode}</p>
              <p className="text-xs text-slate-500 mt-1">
                Show this code to the seller when you pick up your item. The seller will enter it to confirm the handoff.
              </p>
            </div>
          ) : (
            <p className="text-xs text-green-600 mt-2">
              Contact the seller to arrange a pickup time and confirm the exact location.
            </p>
          )}
        </div>
      )}

      {/* Shipping info */}
      {!order.isPickup && (order.shippingName || order.shippingLine1) && (
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

      {/* Tracking info */}
      {order.trackingNumber && (
        <div className="card p-5 mb-4">
          <h2 className="font-bold mb-2">Tracking</h2>
          <p className="text-sm text-slate-600">
            📦 {(order.carrier ?? order.shippingCarrier) && <strong>{order.carrier ?? order.shippingCarrier}: </strong>}
            {order.trackingNumber}
            {order.shippingService ? ` · ${order.shippingService}` : ''}
          </p>
          {trackingUrl && (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex mt-2 text-sm text-blue-600 hover:underline"
            >
              Track Package
            </a>
          )}
        </div>
      )}

      {/* Buyer: confirm delivery for shipped non-pickup orders */}
      {!order.isPickup && order.status === 'SHIPPED' && session.user.id === order.buyerId && (
        <div className="card p-5 mb-4 bg-blue-50 border-blue-200">
          <h2 className="font-bold mb-1 text-blue-800">📬 Have you received your package?</h2>
          <p className="text-sm text-blue-700 mb-3">
            If your order has arrived, let us know so we can complete the order.
          </p>
          <MarkDeliveredButton orderId={order.id} />
        </div>
      )}

      <div className="flex gap-3">
        <Link href="/orders" className="btn-outline flex-1 text-center">← Back to orders</Link>
        <Link href="/" className="btn-primary flex-1 text-center">Continue shopping</Link>
      </div>
    </main>
  );
}
