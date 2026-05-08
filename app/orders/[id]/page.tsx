import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import { getStoredLineSubtotalCents } from '@/lib/commission';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  disputeStatusBadge,
  disputeStatusLabel,
  getReturnWindowState,
  refundStatusBadge,
  refundStatusLabel,
} from '@/lib/disputes';
import DisputeCreationForm from '@/components/DisputeCreationForm';

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

const DISPUTE_FLASH_MESSAGES: Record<string, string> = {
  exists: 'A request already exists for that order item.',
  'not-eligible': 'This order is not ready for a dispute yet.',
  invalid: 'Please complete all required dispute details before submitting.',
  'not-found': 'We could not find the order item you selected.',
  error: 'We could not submit your request. Please try again.',
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'badge-yellow',
    PAID: 'badge-blue',
    SHIPPED: 'badge-green',
    DELIVERED: 'badge-green',
    CANCELLED: 'badge-red',
    REFUNDED: 'badge-slate',
    READY_FOR_PICKUP: 'badge-blue',
    PICKED_UP: 'badge-green',
  };
  return map[status] ?? 'badge-slate';
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dispute?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const sp = await searchParams;

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
              returnWindowDays: true,
              seller: { select: { name: true } },
            },
          },
          dispute: true,
        },
      },
    },
  });

  if (!order) notFound();

  return (
    <main className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/orders" className="text-sm text-slate-500 hover:text-blue-600">← My Orders</Link>
        <Link href="/disputes" className="text-sm text-blue-600 hover:underline">Dispute Center</Link>
      </div>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black">Order #{order.id.slice(-8).toUpperCase()}</h1>
          <p className="text-sm text-slate-500">{new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <span className={`badge ${statusBadge(order.status)}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>

      {sp.dispute === 'created' && (
        <div className="card p-4 mb-4 bg-green-50 border-green-200 text-green-800 text-sm">
          Your request has been submitted to the seller. If needed, FlupFlap can review the dispute and make the final refund decision.
        </div>
      )}
      {sp.dispute && DISPUTE_FLASH_MESSAGES[sp.dispute] && (
        <div className="card p-4 mb-4 bg-red-50 border-red-200 text-red-800 text-sm">
          {DISPUTE_FLASH_MESSAGES[sp.dispute]}
        </div>
      )}

      <div className="card p-5 mb-4">
        <h2 className="font-bold mb-3">Items ordered</h2>
        <div className="space-y-4">
          {order.items.map((item) => {
            const returnWindow = getReturnWindowState({
              returnWindowDays: item.product.returnWindowDays,
              orderStatus: order.status,
              updatedAt: order.updatedAt,
              pickupConfirmedAt: order.pickupConfirmedAt,
            });

            return (
              <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-3">
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
                      Sold by {item.product.seller.name} · {dollars(item.priceCents)} each · Qty: {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold flex-shrink-0">{dollars(getStoredLineSubtotalCents(item))}</p>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{returnWindow.title}</span>
                    {item.dispute && (
                      <>
                        <span className={disputeStatusBadge(item.dispute.status)}>
                          {disputeStatusLabel(item.dispute.status)}
                        </span>
                        <span className={refundStatusBadge(item.dispute.refundStatus)}>
                          {refundStatusLabel(item.dispute.refundStatus)}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-slate-600">{returnWindow.detail}</p>

                  {item.dispute ? (
                    <div className="mt-3 space-y-3 rounded-2xl bg-white p-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buyer request</p>
                        <p className="mt-1 text-slate-700">{item.dispute.description}</p>
                      </div>
                      {item.dispute.sellerResponse && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seller response</p>
                          <p className="mt-1 text-slate-700">{item.dispute.sellerResponse}</p>
                        </div>
                      )}
                      {item.dispute.adminNotes && (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">FlupFlap review</p>
                          <p className="mt-1 text-blue-900">{item.dispute.adminNotes}</p>
                        </div>
                      )}
                      {item.dispute.evidenceUrls.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                          {item.dispute.evidenceUrls.map((url) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={url} src={url} alt="Dispute evidence" className="h-20 w-full rounded-xl object-cover" />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <DisputeCreationForm
                      orderId={order.id}
                      orderItemId={item.id}
                      returnWindowCopy={returnWindow.detail}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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

      {order.trackingNumber && (
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
