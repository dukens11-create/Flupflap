import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import type { Metadata } from 'next';
import { getDeliveryStatusLabel } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'My Orders' };

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'badge-yellow',
    PAID: 'badge-blue',
    SHIPPED: 'badge-green',
    DELIVERED: 'badge-green',
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
          {orders.map(order => (
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
                    <img src={item.product.imageUrl} alt={item.product.title} className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
                    <div>
                      <a href={`/products/${item.product.id}`} className="text-sm font-medium hover:text-blue-600">{item.product.title}</a>
                      <p className="text-xs text-slate-500">Qty: {item.quantity} · {dollars(item.priceCents)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm font-bold">Total: {dollars(order.totalCents)}</span>
                <div className="text-right">
                  {order.deliveryStatus && (
                    <p className="text-xs text-slate-500">Status: {getDeliveryStatusLabel(order.deliveryStatus)}</p>
                  )}
                  {order.trackingNumber && (
                    <p className="text-xs text-slate-500">
                      📦 {order.shippingCarrier ? `${order.shippingCarrier}: ` : ''}{order.trackingNumber}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
