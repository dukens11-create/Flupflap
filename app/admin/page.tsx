import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import { formatCommissionPercent, getMarketplaceSettings } from '@/lib/commission';
import { OrderStatus } from '@prisma/client';
import type { Metadata } from 'next';
import { getVisitorMetrics } from '@/lib/traffic';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Admin Dashboard' };

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'badge-yellow',
    APPROVED: 'badge-green',
    REJECTED: 'badge-red',
    SOLD: 'badge-slate',
    HIDDEN: 'badge-red',
  };
  return map[status] ?? 'badge-slate';
}

const PAID_ORDER_STATUSES: OrderStatus[] = ['PAID', 'SHIPPED', 'DELIVERED', 'PICKED_UP'];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ commission?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');
  const sp = await searchParams;

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (now.getDay() + 6) % 7);
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const suspiciousLoginSince = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);

  const [settings, pending, all, recentOrders, restrictedSellersCount, buyerCount, sellerCount, totalUsersCount, totalOrdersCount, pendingSellerApprovalsCount, pendingKycReviewsCount, paidRevenueAgg, platformCommissionAgg, openReportsCount, openSellerReportsCount, suspiciousLoginCount, activePromotionsCount, productsThisWeek, productsThisMonth, activeListingsCount, soldItemsAgg, revenueThisWeekAgg, revenueThisMonthAgg, visitorMetrics] = await Promise.all([
    getMarketplaceSettings(),
    prisma.product.findMany({
      where: { status: 'PENDING' },
      include: { seller: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { seller: { select: { name: true } } },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { buyer: { select: { name: true, email: true } } },
    }),
    prisma.user.count({
      where: { role: 'SELLER', sellerStatus: { not: 'ACTIVE' } },
    }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.user.count({ where: { role: 'SELLER' } }),
    prisma.user.count(),
    prisma.order.count(),
    prisma.sellerVerification.count({
      where: { adminFallbackStatus: 'PENDING_REVIEW' },
    }),
    prisma.sellerVerification.count({
      where: { status: 'PENDING' },
    }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { status: { in: PAID_ORDER_STATUSES } },
    }),
    prisma.order.aggregate({
      _sum: { platformFeeCents: true },
      where: { status: { in: PAID_ORDER_STATUSES } },
    }),
    prisma.productReport.count({
      where: { status: 'OPEN' },
    }),
    prisma.sellerReport.count({
      where: { status: 'OPEN' },
    }),
    prisma.loginActivity.count({
      where: { suspicious: true, createdAt: { gte: suspiciousLoginSince } },
    }),
    prisma.promotion.count({
      where: { status: 'ACTIVE', expiresAt: { gt: now } },
    }),
    prisma.product.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.product.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.product.count({ where: { status: 'APPROVED' } }),
    prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: { order: { status: { in: PAID_ORDER_STATUSES } } },
    }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: weekStart } },
    }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: monthStart } },
    }),
    getVisitorMetrics(now),
  ]);

  const revenueThisWeekCents = revenueThisWeekAgg._sum.totalCents ?? 0;
  const revenueThisMonthCents = revenueThisMonthAgg._sum.totalCents ?? 0;
  const totalRevenueCents = paidRevenueAgg._sum.totalCents ?? 0;
  const platformCommissionEarnedCents = platformCommissionAgg._sum.platformFeeCents ?? 0;
  const soldItemsCount = soldItemsAgg._sum.quantity ?? 0;

  return (
    <main className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Admin Dashboard</h1>
          <p className="text-slate-500 text-sm">Platform management</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/users" className="btn-outline text-sm">Users →</a>
          <a href="/admin/sellers" className="btn-outline text-sm">Seller Management →</a>
          <a href="/admin/reports" className={`text-sm ${openReportsCount > 0 ? 'btn bg-red-600 hover:bg-red-700 text-white' : 'btn-outline'}`}>
            Reports {openReportsCount > 0 ? `(${openReportsCount})` : '→'}
          </a>
          <a
            href="/admin/fraud"
            className={`text-sm ${openSellerReportsCount > 0 || suspiciousLoginCount > 0 ? 'btn bg-amber-600 hover:bg-amber-700 text-white' : 'btn-outline'}`}
          >
            Fraud {openSellerReportsCount + suspiciousLoginCount > 0 ? `(${openSellerReportsCount + suspiciousLoginCount})` : '→'}
          </a>
          <a href="/admin/promotions" className="btn-outline text-sm">
            Promotions {activePromotionsCount > 0 ? `(${activePromotionsCount})` : '→'}
          </a>
        </div>
      </div>

      {sp.commission === 'updated' && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Default seller commission updated successfully.
        </div>
      )}

      {sp.commission === 'invalid' && (
        <div className="card p-4 mb-6 bg-red-50 border-red-200 text-red-800 text-sm">
          ❌ Enter a valid commission percentage between 0 and 100.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
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
        <a href="/admin/sellers" className="card p-4 text-center hover:bg-slate-50 transition-colors">
          <p className={`text-3xl font-black ${restrictedSellersCount > 0 ? 'text-red-600' : 'text-slate-600'}`}>{restrictedSellersCount}</p>
          <p className="text-sm text-slate-500">Restricted sellers</p>
        </a>
      </div>

      <section className="mb-8 rounded-2xl border border-slate-200 bg-slate-900/95 p-5 text-white">
        <h2 className="text-xl font-bold">Admin Control Panel</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Total Users</p><p className="text-2xl font-black">{totalUsersCount}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Total Sellers</p><p className="text-2xl font-black">{sellerCount}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Total Orders</p><p className="text-2xl font-black">{totalOrdersCount}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Total Revenue</p><p className="text-2xl font-black">{dollars(totalRevenueCents)}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Pending Seller Approvals</p><p className="text-2xl font-black">{pendingSellerApprovalsCount}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Pending KYC Reviews</p><p className="text-2xl font-black">{pendingKycReviewsCount}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Reported Products</p><p className="text-2xl font-black">{openReportsCount}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Platform Commission Earned</p><p className="text-2xl font-black">{dollars(platformCommissionEarnedCents)}</p></div>
        </div>
      </section>

      {/* ── Product Statistics ── */}
      <section id="products-panel" className="mb-8">
        <h2 className="text-xl font-bold mb-3">Product Statistics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="card p-4 text-center">
            <p className="text-2xl font-black text-indigo-600">{productsThisWeek}</p>
            <p className="text-sm text-slate-500">Listed this week</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-black text-indigo-600">{productsThisMonth}</p>
            <p className="text-sm text-slate-500">Listed this month</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-black text-green-600">{activeListingsCount}</p>
            <p className="text-sm text-slate-500">Active listings</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-black text-slate-600">{soldItemsCount}</p>
            <p className="text-sm text-slate-500">Items sold (all time)</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-black text-emerald-600">{dollars(revenueThisWeekCents)}</p>
            <p className="text-sm text-slate-500">Gross revenue this week</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-black text-emerald-600">{dollars(revenueThisMonthCents)}</p>
            <p className="text-sm text-slate-500">Gross revenue this month</p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3">Traffic Analytics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-4 text-center">
            <p className="text-2xl font-black text-blue-600">{visitorMetrics.dailyVisitors}</p>
            <p className="text-sm text-slate-500">Visitors today</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-black text-indigo-600">{visitorMetrics.weeklyVisitors}</p>
            <p className="text-sm text-slate-500">Visitors this week</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-black text-violet-600">{visitorMetrics.monthlyVisitors}</p>
            <p className="text-sm text-slate-500">Visitors this month</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card p-5 flex items-center gap-4">
          <div className="text-3xl">👥</div>
          <div className="flex-1">
            <p className="font-bold text-slate-800">User Management</p>
            <div className="flex gap-3 mt-1">
              <a href="/admin/users?role=CUSTOMER" className="text-sm text-blue-600 hover:underline font-medium">
                🛒 {buyerCount} buyer{buyerCount !== 1 ? 's' : ''}
              </a>
              <span className="text-slate-300">·</span>
              <a href="/admin/users?role=SELLER" className="text-sm text-green-600 hover:underline font-medium">
                🏪 {sellerCount} seller{sellerCount !== 1 ? 's' : ''}
              </a>
            </div>
          </div>
          <a href="/admin/users" className="btn-outline text-xs py-1 px-3">View all →</a>
        </div>
        <a href="/admin/sellers" className="card p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
          <div className="text-3xl">🔒</div>
          <div>
            <p className="font-bold text-slate-800">Seller Moderation</p>
            <p className="text-sm text-slate-500">Suspend or ban sellers for policy violations</p>
          </div>
        </a>
        <a href="/admin/reports" className={`card p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors ${openReportsCount > 0 ? 'border-red-200 bg-red-50' : ''}`}>
          <div className="text-3xl">🚩</div>
          <div>
            <p className="font-bold text-slate-800">Product Reports</p>
            <p className={`text-sm ${openReportsCount > 0 ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
              {openReportsCount > 0 ? `${openReportsCount} open report${openReportsCount !== 1 ? 's' : ''} need review` : 'No open reports'}
            </p>
          </div>
        </a>
        <a
          href="/admin/fraud"
          className={`card p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors ${openSellerReportsCount > 0 || suspiciousLoginCount > 0 ? 'border-amber-200 bg-amber-50' : ''}`}
        >
          <div className="text-3xl">🛡️</div>
          <div>
            <p className="font-bold text-slate-800">Fraud Protection</p>
            <p className={`text-sm ${openSellerReportsCount > 0 || suspiciousLoginCount > 0 ? 'text-amber-700 font-medium' : 'text-slate-500'}`}>
              {openSellerReportsCount > 0 || suspiciousLoginCount > 0
                ? `${openSellerReportsCount} seller report${openSellerReportsCount !== 1 ? 's' : ''} · ${suspiciousLoginCount} login alert${suspiciousLoginCount !== 1 ? 's' : ''}`
                : 'No seller reports or login alerts'}
            </p>
          </div>
        </a>
        <a href="/admin/promotions" className="card p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
          <div className="text-3xl">⭐</div>
          <div>
            <p className="font-bold text-slate-800">Paid Promotions</p>
            <p className="text-sm text-slate-500">
              {activePromotionsCount > 0 ? `${activePromotionsCount} active promotion${activePromotionsCount !== 1 ? 's' : ''}` : 'No active promotions'}
            </p>
          </div>
        </a>
      </div>

      <section id="site-settings" className="mb-8">
          <div id="payments-panel" className="card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-bold">Marketplace Commission</h2>
                <p className="text-sm text-slate-500 mt-1">
                  FlupFlap keeps a fixed {formatCommissionPercent(settings.defaultSellerCommissionBps)} commission on each paid seller item.
                  Order items store the rate, subtotal, fee, and seller net amount at payment time for later payout reporting.
                </p>
              </div>
              <div className="card px-4 py-3 bg-slate-50 border-slate-200 text-sm text-slate-600">
                Fixed commission: <span className="font-semibold text-slate-900">{formatCommissionPercent(settings.defaultSellerCommissionBps)}</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              New checkout sessions and paid orders automatically use the fixed 7% commission. Existing orders keep their stored commission snapshots for audit reporting.
            </p>
          </div>
        </section>

      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">⏳ Pending Approval</h2>
          <div className="space-y-3">
            {pending.map((p: (typeof pending)[number]) => (
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
          {all.map((p: (typeof all)[number]) => (
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

      <section id="orders-panel">
        <h2 className="text-xl font-bold mb-3">Recent Orders</h2>
        <div className="space-y-2">
          {recentOrders.map((o: (typeof recentOrders)[number]) => (
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
