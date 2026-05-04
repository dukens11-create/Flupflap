import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Admin Dashboard' };

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'badge-yellow',
    APPROVED: 'badge-green',
    REJECTED: 'badge-red',
    SOLD: 'badge-slate',
  };
  return map[status] ?? 'badge-slate';
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const pending = await prisma.product.findMany({
    where: { status: 'PENDING' },
    include: { seller: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const all = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { seller: { select: { name: true } } },
  });
  const recentOrders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { buyer: { select: { name: true, email: true } } },
  });

  return (
    <main className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-black">Admin Dashboard</h1>
        <p className="text-slate-500 text-sm">Platform management</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-yellow-600">{pending.length}</p>
          <p className="text-sm text-slate-500">Pending review</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-blue-600">{all.length}</p>
          <p className="text-sm text-slate-500">Total listings</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-green-600">{recentOrders.length}</p>
          <p className="text-sm text-slate-500">Recent orders</p>
        </div>
      </div>

      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">⏳ Pending Approval</h2>
          <div className="space-y-3">
            {pending.map(p => (
              <div key={p.id} className="card p-4">
                <div className="flex gap-4 items-start">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt={p.title} className="w-20 h-20 object-cover rounded-xl flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">{p.title}</p>
                    <p className="text-sm text-slate-500">{p.condition} · {p.category} · {dollars(p.priceCents)}</p>
                    <p className="text-xs text-slate-400">Seller: {p.seller.name} ({p.seller.email})</p>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{p.description}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <form action={`/api/admin/products/${p.id}`} method="POST">
                      <input type="hidden" name="_method" value="approve" />
                      <button type="submit" className="btn bg-green-600 hover:bg-green-700 text-white text-sm w-full">✓ Approve</button>
                    </form>
                    <form action={`/api/admin/products/${p.id}`} method="POST">
                      <input type="hidden" name="_method" value="reject" />
                      <button type="submit" className="btn bg-red-600 hover:bg-red-700 text-white text-sm w-full">✗ Reject</button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3">All Listings</h2>
        <div className="space-y-2">
          {all.map(p => (
            <div key={p.id} className="card p-3 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.title}</p>
                <p className="text-xs text-slate-500">{p.seller.name} · {p.condition} · {dollars(p.priceCents)}</p>
              </div>
              <span className={statusBadge(p.status)}>{p.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">Recent Orders</h2>
        <div className="space-y-2">
          {recentOrders.map(o => (
            <div key={o.id} className="card p-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-slate-400">{o.id.slice(-10)}</p>
                <p className="text-sm font-medium">{o.buyer.name} · {dollars(o.totalCents)}</p>
              </div>
              <span className={`badge ${o.status === 'PAID' || o.status === 'SHIPPED' || o.status === 'DELIVERED' ? 'badge-green' : 'badge-yellow'}`}>{o.status}</span>
            </div>
          ))}
          {recentOrders.length === 0 && <div className="card p-4 text-slate-500">No orders yet.</div>}
        </div>
      </section>
    </main>
  );
}
