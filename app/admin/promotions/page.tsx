import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import { activePromotionWhere } from '@/lib/promotions';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Promotions — Admin' };

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'badge-green',
    PENDING_PAYMENT: 'badge-yellow',
    EXPIRED: 'badge-slate',
    CANCELLED: 'badge-red',
  };
  return map[status] ?? 'badge-slate';
}

export default async function AdminPromotionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const now = new Date();

  const [activePromotions, pendingPromotions, recentExpired] = await Promise.all([
    prisma.promotion.findMany({
      where: activePromotionWhere(now),
      include: {
        product: { select: { title: true, imageUrl: true, id: true } },
        seller: { select: { name: true, email: true } },
      },
      orderBy: { expiresAt: 'asc' },
    }),
    prisma.promotion.findMany({
      where: { status: 'PENDING_PAYMENT' },
      include: {
        product: { select: { title: true, id: true } },
        seller: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.promotion.findMany({
      where: { status: { in: ['EXPIRED', 'CANCELLED'] } },
      include: {
        product: { select: { title: true, id: true } },
        seller: { select: { name: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
  ]);

  const formatDate = (d: Date | null) =>
    d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <main className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Promotions</h1>
          <p className="text-slate-500 text-sm">Paid featured listings across the marketplace</p>
        </div>
        <Link href="/admin" className="btn-outline text-sm">← Admin</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-green-600">{activePromotions.length}</p>
          <p className="text-sm text-slate-500">Active</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-yellow-600">{pendingPromotions.length}</p>
          <p className="text-sm text-slate-500">Pending payment</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-slate-600">{recentExpired.length}</p>
          <p className="text-sm text-slate-500">Expired / cancelled</p>
        </div>
      </div>

      {/* Active promotions */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3">⭐ Active Promotions ({activePromotions.length})</h2>
        {activePromotions.length === 0 ? (
          <div className="card p-5 text-slate-500">No active promotions.</div>
        ) : (
          <div className="space-y-2">
            {activePromotions.map(promo => (
              <div key={promo.id} className="card p-4 flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={promo.product.imageUrl} alt={promo.product.title} className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{promo.product.title}</p>
                  <p className="text-xs text-slate-500">
                    Seller: {promo.seller.name} ({promo.seller.email})
                  </p>
                  <p className="text-xs text-slate-400">
                    {promo.durationDays}-day plan · {dollars(promo.priceCents)} · Expires {formatDate(promo.expiresAt)}
                  </p>
                </div>
                <span className={`badge ${statusBadge(promo.status)}`}>{promo.status}</span>
                <Link href={`/products/${promo.product.id}`} className="btn-outline text-xs py-1 px-2 flex-shrink-0">View →</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending payment */}
      {pendingPromotions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">⏳ Pending Payment ({pendingPromotions.length})</h2>
          <div className="space-y-2">
            {pendingPromotions.map(promo => (
              <div key={promo.id} className="card p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{promo.product.title}</p>
                  <p className="text-xs text-slate-500">Seller: {promo.seller.name} ({promo.seller.email})</p>
                  <p className="text-xs text-slate-400">{promo.durationDays}-day plan · {dollars(promo.priceCents)} · Created {formatDate(promo.createdAt)}</p>
                </div>
                <span className={`badge ${statusBadge(promo.status)}`}>{promo.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent expired/cancelled */}
      {recentExpired.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-3">History (last 20)</h2>
          <div className="space-y-2">
            {recentExpired.map(promo => (
              <div key={promo.id} className="card p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{promo.product.title}</p>
                  <p className="text-xs text-slate-500">Seller: {promo.seller.name}</p>
                  <p className="text-xs text-slate-400">{promo.durationDays}-day plan · {dollars(promo.priceCents)} · Expired {formatDate(promo.expiresAt)}</p>
                </div>
                <span className={`badge ${statusBadge(promo.status)}`}>{promo.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
