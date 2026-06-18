import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import Link from 'next/link';
import type { Metadata } from 'next';
import { expirePromotions, getPromotionLabel, getPromotionPlans } from '@/lib/promotions';
import { getMarketplaceSettings } from '@/lib/commission';

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

export default async function AdminPromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const { success: successParam, error: errorParam } = await searchParams;
  await expirePromotions();
  const now = new Date();

  const [activePromotions, pendingPromotions, recentExpired, promotionPlans, settings, sellers] = await Promise.all([
    prisma.promotion.findMany({
      where: { status: 'ACTIVE', expiresAt: { gt: now } },
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
    getPromotionPlans(),
    getMarketplaceSettings(),
    prisma.user.findMany({
      where: { role: 'SELLER' },
      select: { id: true, name: true, email: true, promotionCredits: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  const formatDate = (d: Date | null) =>
    d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const promotionRevenueCents = [...activePromotions, ...recentExpired]
    .reduce((sum, promotion) => sum + Math.max(0, promotion.priceCents), 0);

  return (
    <main className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Promotions</h1>
          <p className="text-slate-500 text-sm">Paid boosted listings across the marketplace</p>
        </div>
        <Link href="/admin" className="btn-outline text-sm">← Admin</Link>
      </div>

      {successParam && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ {successParam}
        </div>
      )}

      {errorParam && (
        <div className="card p-4 mb-6 bg-red-50 border-red-200 text-red-800 text-sm">
          ⚠ {errorParam}
        </div>
      )}

      <section className="card p-5 mb-8">
        <div className="mb-4">
          <h2 className="text-xl font-bold">Free promotion settings</h2>
          <p className="text-sm text-slate-500">Control new-seller free promotion availability and duration.</p>
        </div>
        <form action="/api/admin/promotions/pricing" method="POST" className="space-y-4 mb-8">
          <input type="hidden" name="action" value="free_settings" />
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="freePromotionEnabled" defaultChecked={settings.freePromotionEnabled} />
            Enable free promotion for new sellers
          </label>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Free promotion duration (days)</label>
            <input type="number" name="freePromotionDurationDays" min="1" defaultValue={settings.freePromotionDurationDays} className="input w-full max-w-xs" />
          </div>
          <button type="submit" className="btn-primary">Save free promotion settings</button>
        </form>

        <div className="mb-4">
          <h2 className="text-xl font-bold">Grant promotion credits</h2>
          <p className="text-sm text-slate-500">Manually add free promotion credits to a seller account.</p>
        </div>
        <form action="/api/admin/promotions/pricing" method="POST" className="space-y-4 mb-8">
          <input type="hidden" name="action" value="grant_credits" />
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Seller</label>
            <select name="sellerId" className="input w-full" defaultValue="" required>
              <option value="" disabled>Select a seller…</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name} ({seller.email}) — credits: {seller.promotionCredits}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Credits to grant</label>
            <input type="number" name="credits" min="1" step="1" defaultValue={1} className="input w-full max-w-xs" />
          </div>
          <button type="submit" className="btn-primary">Grant credits</button>
        </form>

        <div className="mb-4">
          <h2 className="text-xl font-bold">Promotion pricing</h2>
          <p className="text-sm text-slate-500">Update seller promotion pricing from the admin dashboard.</p>
        </div>
        <form action="/api/admin/promotions/pricing" method="POST" className="space-y-4">
          <input type="hidden" name="action" value="pricing" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {promotionPlans.map(plan => (
              <label key={plan.id} className="card p-4 block">
                <span className="block font-semibold text-slate-800">{plan.label}</span>
                <span className="block text-xs text-slate-500 mb-3">{plan.description}</span>
                <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Price (USD)</span>
                <input
                  type="number"
                  name={`price_${plan.durationDays}`}
                  min="0"
                  step="0.01"
                  defaultValue={(plan.priceCents / 100).toFixed(2)}
                  className="input w-full"
                />
              </label>
            ))}
          </div>
          <button type="submit" className="btn-primary">Save pricing</button>
        </form>
      </section>

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

      <div className="card p-4 mb-8">
        <p className="text-xs uppercase tracking-wide text-slate-500">Promo revenue</p>
        <p className="text-2xl font-black text-emerald-700">{dollars(promotionRevenueCents)}</p>
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
                {promo.product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={promo.product.imageUrl} alt={promo.product.title ?? 'Listing'} className="h-12 w-12 flex-shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-slate-100 flex-shrink-0" aria-hidden="true" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{promo.product.title}</p>
                  <p className="text-xs text-slate-500">
                    Seller: {promo.seller.name} ({promo.seller.email})
                  </p>
                  <p className="text-xs text-slate-400">
                    {getPromotionLabel(promo.durationDays)} · {dollars(promo.priceCents)} · Expires {formatDate(promo.expiresAt)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {promo.impressionCount} impressions · {promo.clickCount} clicks · {promo.saleCount} sales ({dollars(promo.saleAmountCents)})
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
                    <p className="text-xs text-slate-400">{getPromotionLabel(promo.durationDays)} · {dollars(promo.priceCents)} · Created {formatDate(promo.createdAt)}</p>
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
                    <p className="text-xs text-slate-400">{getPromotionLabel(promo.durationDays)} · {dollars(promo.priceCents)} · Expired {formatDate(promo.expiresAt)}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {promo.impressionCount} impressions · {promo.clickCount} clicks · {promo.saleCount} sales ({dollars(promo.saleAmountCents)})
                    </p>
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
