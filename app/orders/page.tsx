import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import { buildTrackingUrl } from '@/lib/shipping';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'My Orders' };

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  REFUND_REQUESTED: 'Refund Requested',
  PARTIALLY_REFUNDED: 'Partially Refunded',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'badge-yellow',
    PAID: 'badge-blue',
    SHIPPED: 'badge-green',
    DELIVERED: 'badge-green',
    REFUND_REQUESTED: 'badge-yellow',
    PARTIALLY_REFUNDED: 'badge-blue',
    CANCELLED: 'badge-red',
    REFUNDED: 'badge-slate',
  };
  return map[status] ?? 'badge-slate';
}

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const orders = await prisma.order.findMany({
    where: { buyerId: session.user.id },
    include: {
      items: {
        include: {
          product: { select: { title: true, imageUrl: true, id: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <main className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-black mb-6">My Orders</h1>
      {orders.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          No orders yet. <a href="/" className="text-blue-600 hover:underline">Start shopping</a>.
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const trackingUrl = order.trackingUrl ?? buildTrackingUrl(order.carrier ?? order.shippingCarrier, order.trackingNumber);
            return (
              <div key={order.id} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <a href={`/orders/${order.id}`} className="text-xs font-mono text-slate-400 hover:text-blue-600">Order #{order.id.slice(-8).toUpperCase()}</a>
                    <p className="text-xs text-slate-400">{new Date(order.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className={statusBadge(order.status)}>{STATUS_LABELS[order.status] ?? order.status}</span>
                </div>
                <div className="space-y-2 mb-3">
                  {order.items.map(item => (
                    <div key={item.id} className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.product.imageUrl} alt={item.product.title} className="h-12 w-12 flex-shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1" />
                      <div>
                        <a href={`/products/${item.product.id}`} className="text-sm font-medium hover:text-blue-600">{item.product.title}</a>
                        <p className="text-xs text-slate-500">Qty: {item.quantity} · {dollars(item.priceCents)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-sm font-bold">Total: {dollars(order.totalCents)}</span>
                  {order.trackingNumber && (
                    <div className="text-right">
                      <p className="text-xs text-slate-500">
                        📦 {order.carrier ?? order.shippingCarrier}: {order.trackingNumber}
                        {order.shippingService ? ` · ${order.shippingService}` : ''}
                      </p>
                      {trackingUrl && (
                        <a
                          className="text-xs text-blue-600 hover:underline"
                          href={trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Track Package
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
