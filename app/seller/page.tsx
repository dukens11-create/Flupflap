import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Seller Dashboard' };

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'badge-yellow',
    APPROVED: 'badge-green',
    REJECTED: 'badge-red',
    SOLD: 'badge-slate',
  };
  return map[status] ?? 'badge-slate';
}

export default async function SellerPage({ searchParams }: { searchParams: Promise<{ created?: string; stripe?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');
  const sp = await searchParams;

  const [products, orders] = await Promise.all([
    prisma.product.findMany({
      where: { sellerId: session.user.id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.findMany({
      where: { items: { some: { product: { sellerId: session.user.id } } } },
      include: { items: { include: { product: { select: { title: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  const stripeOnboarded = session.user.stripeOnboardingComplete;

  return (
    <main className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black">Seller Dashboard</h1>
          <p className="text-slate-500 text-sm">Welcome back, {session.user.name}</p>
        </div>
        <Link href="/seller/new" className="btn-primary">+ New listing</Link>
      </div>

      {sp.created && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Product submitted for review! It will appear publicly once approved by an admin.
        </div>
      )}

      {(sp as any).updated && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Listing updated and re-submitted for review.
        </div>
      )}

      {(sp as any).deleted && (
        <div className="card p-4 mb-6 bg-slate-50 border-slate-200 text-slate-700 text-sm">
          🗑️ Listing deleted.
        </div>
      )}

      {sp.stripe === 'connected' && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Stripe account connected! You&apos;re now set up to receive payouts.
        </div>
      )}

      {!stripeOnboarded && (
        <div className="card p-4 mb-6 bg-yellow-50 border-yellow-200 text-yellow-800 text-sm flex justify-between items-center">
          <span>⚠️ Connect your bank account via Stripe to receive payouts.</span>
          <a href="/api/stripe/connect" className="btn-outline text-xs">Connect Stripe</a>
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3">My Listings</h2>
        {products.length === 0 ? (
          <div className="card p-6 text-slate-500">No listings yet. <Link href="/seller/new" className="text-blue-600 hover:underline">Create one</Link>.</div>
        ) : (
          <div className="space-y-3">
            {products.map(p => (
              <div key={p.id} className="card p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.title}</p>
                  <p className="text-sm text-slate-500">{p.condition} · {p.category} · {dollars(p.priceCents)}</p>
                </div>
                <span className={statusBadge(p.status)}>{p.status}</span>
                {p.status !== 'SOLD' && (
                  <Link href={`/seller/edit/${p.id}`} className="btn-outline text-xs py-1 px-2 flex-shrink-0">Edit</Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">Recent Orders</h2>
        {orders.length === 0 ? (
          <div className="card p-6 text-slate-500">No orders yet.</div>
        ) : (
          <div className="space-y-3">
            {orders.map(o => (
              <div key={o.id} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono">{o.id.slice(-8)}</span>
                  <span className={`badge ${o.status === 'PAID' || o.status === 'SHIPPED' || o.status === 'DELIVERED' ? 'badge-green' : 'badge-yellow'}`}>{o.status}</span>
                </div>
                {o.items.map(i => (
                  <p key={i.id} className="text-sm text-slate-700">{i.product.title} × {i.quantity}</p>
                ))}
                <p className="text-sm font-bold mt-2">{dollars(o.totalCents)}</p>
                {(o.status === 'PAID') && (
                  <form action="/api/seller/ship" method="POST" className="mt-3 flex gap-2">
                    <input type="hidden" name="orderId" value={o.id} />
                    <input name="trackingNumber" className="input flex-1" placeholder="Tracking number" />
                    <input name="shippingCarrier" className="input w-24" placeholder="Carrier" />
                    <button type="submit" className="btn-primary text-sm">Mark Shipped</button>
                  </form>
                )}
                {o.trackingNumber && (
                  <p className="text-xs text-slate-500 mt-2">📦 {o.shippingCarrier}: {o.trackingNumber}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
