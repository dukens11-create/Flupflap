import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import { getStoredLineSubtotalCents } from '@/lib/commission';
import { requireSeller } from '@/lib/require-seller';
import SellerPromotionsNav from '@/components/SellerPromotionsNav';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Seller Sales' };

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5 flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-black text-slate-900">{value}</p>
      {sub ? <p className="text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}

export default async function SellerSalesPage() {
  const { sellerId } = await requireSeller();

  const [products, soldItems, recentOrders] = await Promise.all([
    prisma.product.findMany({
      where: { sellerId },
      select: { id: true, title: true, viewCount: true, soldQty: true, status: true, inventory: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.orderItem.findMany({
      where: {
        product: { sellerId },
        order: { status: { in: ['PAID', 'SHIPPED', 'DELIVERED', 'PICKED_UP'] } },
      },
      include: {
        product: { select: { id: true, title: true } },
        order: { select: { id: true, status: true, createdAt: true } },
      },
      orderBy: { order: { createdAt: 'desc' } },
      take: 25,
    }),
    prisma.order.findMany({
      where: { items: { some: { product: { sellerId } } } },
      include: {
        items: {
          where: { product: { sellerId } },
          include: { product: { select: { title: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  const grossSalesCents = soldItems.reduce((sum, item) => sum + getStoredLineSubtotalCents(item), 0);
  const itemsSoldCount = soldItems.reduce((sum, item) => sum + item.quantity, 0);
  const completedOrdersCount = new Set(soldItems.map((item) => item.order.id)).size;
  const activeListingsCount = products.filter((product) => product.status === 'APPROVED' && product.inventory > 0).length;
  const totalViews = products.reduce((sum, product) => sum + (product.viewCount ?? 0), 0);
  const totalSold = products.reduce((sum, product) => sum + (product.soldQty ?? 0), 0);
  const orderToViewRatio = totalViews > 0 ? ((completedOrdersCount / totalViews) * 100).toFixed(1) : null;

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-4">
        <Link href="/seller" className="text-sm text-slate-500 hover:underline">← Back to seller dashboard</Link>
        <SellerPromotionsNav active="sales" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Sales</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Focused sales records, recent order activity, and seller performance metrics. Promotion creation and management live in the Promotions area.
            </p>
          </div>
          <Link href="/seller/promotions" className="btn-outline">Open Promotions</Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Gross Sales" value={dollars(grossSalesCents)} />
        <StatCard label="Items Sold" value={String(itemsSoldCount)} />
        <StatCard label="Completed Orders" value={String(completedOrdersCount)} />
        <StatCard label="Active Listings" value={String(activeListingsCount)} />
        <StatCard label="Order/View Ratio" value={orderToViewRatio ? `${orderToViewRatio}%` : '—'} sub="completed orders ÷ listing views" />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">Recent sales activity</h2>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Latest paid orders</span>
          </div>
          <div className="mt-4 space-y-4">
            {soldItems.length === 0 ? (
              <p className="text-sm text-slate-500">No completed sales yet.</p>
            ) : soldItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{item.product.title}</p>
                    <p className="mt-1 text-sm text-slate-500">Order #{item.order.id.slice(-8)} · {item.order.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{dollars(getStoredLineSubtotalCents(item))}</p>
                    <p className="mt-1 text-sm text-slate-500">Qty {item.quantity} · {item.order.status.replaceAll('_', ' ')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-xl font-bold text-slate-900">Listing performance</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Views</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{totalViews.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Units Sold</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{totalSold.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-bold text-slate-900">Recent orders</h2>
            <div className="mt-4 space-y-3">
              {recentOrders.length === 0 ? (
                <p className="text-sm text-slate-500">No orders found.</p>
              ) : recentOrders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">Order #{order.id.slice(-8)}</p>
                    <span className="badge badge-slate">{order.status.replaceAll('_', ' ')}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{order.items.length} item{order.items.length === 1 ? '' : 's'} from your store</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
