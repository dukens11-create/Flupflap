import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import { formatCommissionPercent, getMarketplaceSettings } from '@/lib/commission';
import { OrderStatus } from '@prisma/client';
import type { Metadata } from 'next';
import { getVisitorMetrics } from '@/lib/traffic';
import AdminListingsTable from '@/components/AdminListingsTable';
import { getSellerKycStats } from '@/lib/seller-kyc-stats';
import { isSchemaNotInitializedError } from '@/lib/db-errors';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Admin Dashboard' };

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

  try {
    const [settings, pending, all, recentOrders, restrictedSellersCount, buyerCount, sellerCount, totalUsersCount, totalOrdersCount, pendingSellerApprovalsCount, paidRevenueAgg, platformCommissionAgg, openReportsCount, openSellerReportsCount, suspiciousLoginCount, activePromotionsCount, productsThisWeek, productsThisMonth, activeListingsCount, soldItemsAgg, revenueThisWeekAgg, revenueThisMonthAgg, visitorMetrics, kycCounts] = await Promise.all([
      getMarketplaceSettings(),
      prisma.product.findMany({
        where: { status: 'PENDING' },
        include: { seller: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          imageUrl: true,
          mainImage: true,
          images: true,
          priceCents: true,
          inventory: true,
          status: true,
          condition: true,
          category: true,
          createdAt: true,
          seller: { select: { id: true, name: true } },
        },
      }),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { buyer: { select: { name: true, email: true } } },
      }),
      // Sellers who are restricted (not active) — excludes PENDING which is its own category
      prisma.user.count({
        where: { role: 'SELLER', sellerStatus: { in: ['SUSPENDED', 'BANNED', 'RESTRICTED'] } },
      }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.user.count({ where: { role: 'SELLER' } }),
      prisma.user.count(),
      prisma.order.count(),
      // Pending Seller Approvals: seller accounts awaiting admin account approval
      prisma.user.count({
        where: { role: 'SELLER', sellerStatus: 'PENDING' },
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
      // KYC counts use shared helpers that read both kycStatus and the legacy
      // verifiedSeller flag so previously-approved sellers are never miscounted.
      getSellerKycStats(),
    ]);

  const { kycApprovedCount, kycPendingCount, kycRejectedCount, kycNotSubmittedCount } = kycCounts;

  const revenueThisWeekCents = revenueThisWeekAgg._sum.totalCents ?? 0;
  const revenueThisMonthCents = revenueThisMonthAgg._sum.totalCents ?? 0;
  const totalRevenueCents = paidRevenueAgg._sum.totalCents ?? 0;
  const platformCommissionEarnedCents = platformCommissionAgg._sum.platformFeeCents ?? 0;
  const soldItemsCount = soldItemsAgg._sum.quantity ?? 0;

  return (
    <main className="w-full max-w-5xl mx-auto px-4 sm:px-6">
      <div className="mb-4">
        <h1 className="text-3xl font-black">Admin Dashboard</h1>
        <p className="text-slate-500 text-sm">Platform management</p>
      </div>

      {/* Horizontally scrollable nav cards — does NOT make the page scroll sideways */}
      <div className="mb-6 -mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto">
        <div className="flex gap-2 w-max pb-1">
          <a href="/admin/users" className="btn-outline text-sm whitespace-nowrap min-w-[120px]">Users →</a>
          <a href="/admin/sellers" className="btn-outline text-sm whitespace-nowrap min-w-[120px]">Sellers →</a>
          <a href="/admin/reports" className={`text-sm whitespace-nowrap min-w-[120px] ${openReportsCount > 0 ? 'btn bg-red-600 hover:bg-red-700 text-white' : 'btn-outline'}`}>
            Reports {openReportsCount > 0 ? `(${openReportsCount})` : '→'}
          </a>
          <a
            href="/admin/fraud"
            className={`text-sm whitespace-nowrap min-w-[120px] ${openSellerReportsCount > 0 || suspiciousLoginCount > 0 ? 'btn bg-amber-600 hover:bg-amber-700 text-white' : 'btn-outline'}`}
          >
            Fraud {openSellerReportsCount + suspiciousLoginCount > 0 ? `(${openSellerReportsCount + suspiciousLoginCount})` : '→'}
          </a>
          <a href="/admin/promotions" className="btn-outline text-sm whitespace-nowrap min-w-[120px]">
            Promotions {activePromotionsCount > 0 ? `(${activePromotionsCount})` : '→'}
          </a>
          <a href="/admin/categories" className="btn-outline text-sm whitespace-nowrap min-w-[120px]">Categories →</a>
          <a href="/admin/sellers#kyc-verification" className="btn-outline text-sm whitespace-nowrap min-w-[120px]">KYC →</a>
          <a href="/admin#site-settings" className="btn-outline text-sm whitespace-nowrap min-w-[120px]">Settings →</a>
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
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
          <p className="text-sm text-slate-500">Suspended/restricted</p>
        </a>
      </div>

      <section className="mb-8 rounded-2xl border border-slate-200 bg-slate-900/95 p-4 sm:p-5 text-white w-full max-w-full overflow-hidden">
        <h2 className="text-xl font-bold">Admin Control Panel</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Total Users</p><p className="text-2xl font-black">{totalUsersCount}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Total Sellers</p><p className="text-2xl font-black">{sellerCount}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Total Orders</p><p className="text-2xl font-black">{totalOrdersCount}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Total Revenue</p><p className="text-2xl font-black">{dollars(totalRevenueCents)}</p></div>
          <a href="/admin/sellers?status=PENDING" aria-label="View pending seller accounts" className="rounded-xl bg-white/10 p-3 hover:bg-white/20 transition-colors">
            <p className="text-xs text-slate-200">Pending Seller Accounts</p>
            <p className={`text-2xl font-black ${pendingSellerApprovalsCount > 0 ? 'text-yellow-300' : ''}`}>{pendingSellerApprovalsCount}</p>
          </a>
          <a href="/admin/sellers?kyc=PENDING_REVIEW" aria-label="View sellers with KYC pending review" className="rounded-xl bg-white/10 p-3 hover:bg-white/20 transition-colors">
            <p className="text-xs text-slate-200">KYC Pending Review</p>
            <p className={`text-2xl font-black ${kycPendingCount > 0 ? 'text-yellow-300' : ''}`}>{kycPendingCount}</p>
          </a>
          <a href="/admin/sellers?kyc=APPROVED" aria-label="View sellers with KYC approved" className="rounded-xl bg-white/10 p-3 hover:bg-white/20 transition-colors">
            <p className="text-xs text-slate-200">KYC Approved</p>
            <p className="text-2xl font-black text-green-300">{kycApprovedCount}</p>
          </a>
          <a href="/admin/sellers?kyc=REJECTED" aria-label="View sellers with KYC rejected" className="rounded-xl bg-white/10 p-3 hover:bg-white/20 transition-colors">
            <p className="text-xs text-slate-200">KYC Rejected</p>
            <p className={`text-2xl font-black ${kycRejectedCount > 0 ? 'text-red-300' : ''}`}>{kycRejectedCount}</p>
          </a>
          <a href="/admin/sellers?kyc=NOT_SUBMITTED" aria-label="View sellers with KYC not submitted" className="rounded-xl bg-white/10 p-3 hover:bg-white/20 transition-colors">
            <p className="text-xs text-slate-200">KYC Not Submitted</p>
            <p className="text-2xl font-black">{kycNotSubmittedCount}</p>
          </a>
          <a href="/admin/sellers" aria-label="View suspended or restricted sellers" className="rounded-xl bg-white/10 p-3 hover:bg-white/20 transition-colors">
            <p className="text-xs text-slate-200">Suspended/Restricted Sellers</p>
            <p className={`text-2xl font-black ${restrictedSellersCount > 0 ? 'text-red-300' : ''}`}>{restrictedSellersCount}</p>
          </a>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Reported Products</p><p className="text-2xl font-black">{openReportsCount}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-200">Platform Commission Earned</p><p className="text-2xl font-black">{dollars(platformCommissionEarnedCents)}</p></div>
        </div>
      </section>

      {/* ── Product Statistics ── */}
      <section id="products-panel" className="mb-8">
        <h2 className="text-xl font-bold mb-3">Product Statistics</h2>
        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-3 gap-3">
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
        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-3 gap-3">
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
        <div className="card p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="text-3xl">👥</div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800">User Management</p>
            <div className="flex flex-wrap gap-2 mt-1">
              <a href="/admin/users?role=CUSTOMER" className="text-sm text-blue-600 hover:underline font-medium">
                🛒 {buyerCount} buyer{buyerCount !== 1 ? 's' : ''}
              </a>
              <span className="text-slate-300">·</span>
              <a href="/admin/users?role=SELLER" className="text-sm text-green-600 hover:underline font-medium">
                🏪 {sellerCount} seller{sellerCount !== 1 ? 's' : ''}
              </a>
            </div>
          </div>
          <a href="/admin/users" className="btn-outline text-xs py-1 px-3 self-start sm:self-center shrink-0">View all →</a>
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

      <section id="site-settings" className="mb-4">
        <div className="card p-4 bg-slate-100 border-slate-200 text-sm text-slate-600">
          Site settings and marketplace payment controls.
        </div>
      </section>

      <section id="payments-panel" className="mb-8">
          <div className="card p-5">
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
                  <img src={p.imageUrl} alt={p.title} className="h-20 w-20 flex-shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">{p.title}</p>
                    <p className="text-sm text-slate-500">{p.condition} · {p.category} · {dollars(p.priceCents)}</p>
                    <p className="text-xs text-slate-400">Seller: {p.seller.name} ({p.seller.email})</p>
                    <p className="text-xs text-slate-500 mt-0.5">Stock: <span className={`font-semibold ${p.inventory <= 0 ? 'text-red-600' : p.inventory <= 5 ? 'text-orange-600' : 'text-green-700'}`}>{p.inventory <= 0 ? 'Out of stock' : `${p.inventory} available`}</span></p>
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

      <AdminListingsTable
        listings={all.map((p) => ({
          ...p,
          status: p.status as string,
          createdAt: p.createdAt.toISOString(),
        }))}
      />

      <section id="orders-panel" className="mb-8">
        <h2 className="text-xl font-bold mb-4">Recent Orders</h2>
        <div className="card overflow-hidden">
          {recentOrders.length === 0 ? (
            <div className="p-6 text-slate-500 text-sm">No orders yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Order ID</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Buyer</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentOrders.map((o: (typeof recentOrders)[number]) => {
                    const isPaid = o.status === 'PAID' || o.status === 'SHIPPED' || o.status === 'DELIVERED';
                    return (
                      <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-400">{o.id.slice(-10)}</td>
                        <td className="px-3 py-2.5 text-slate-700">{o.buyer.name}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-slate-900">{dollars(o.totalCents)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {o.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`badge ${isPaid ? 'badge-green' : 'badge-yellow'}`}>{o.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
  } catch (err: unknown) {
    if (isSchemaNotInitializedError(err)) {
      return (
        <main className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <div className="mb-4">
            <h1 className="text-3xl font-black">Admin Dashboard</h1>
          </div>
          <div className="card p-10 text-center text-slate-500">
            <p className="font-semibold text-slate-700 mb-1">Database schema not yet initialized</p>
            <p className="text-sm">
              The database is connected but required tables or columns are missing.{' '}
              Run <code className="font-mono text-xs bg-slate-100 px-1 rounded">prisma migrate deploy</code> to
              apply all committed migrations, then reload this page.
            </p>
          </div>
        </main>
      );
    }
    throw err;
  }
}
