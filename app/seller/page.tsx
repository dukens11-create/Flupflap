import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import { formatCommissionPercent, getMarketplaceSettings } from '@/lib/commission';
import { classifyStripeError, getCurrentStripeMode, modeFromStripeLivemode, stripe } from '@/lib/stripe';
import Link from 'next/link';
import type { Metadata } from 'next';
import PickupVerifyForm from '@/components/PickupVerifyForm';
import { expirePromotions } from '@/lib/promotions';

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

function orderStatusBadge(status: string) {
  const greenStatuses = ['PAID', 'SHIPPED', 'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP'];
  return greenStatuses.includes(status) ? 'badge-green' : 'badge-yellow';
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5 flex flex-col gap-1">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default async function SellerPage({ searchParams }: { searchParams: Promise<{ created?: string; stripe?: string; reason?: string; updated?: string; deleted?: string; promoted?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');
  const sp = await searchParams;

  // Fetch full user to check seller status (session JWT may be stale)
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  const sellerStatus = dbUser?.sellerStatus ?? 'ACTIVE';
  const isRestricted = sellerStatus === 'SUSPENDED' || sellerStatus === 'BANNED';

  await expirePromotions();
  const [settings, products, orders, soldItems] = await Promise.all([
    getMarketplaceSettings(),
    prisma.product.findMany({
      where: { sellerId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        promotions: {
          where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.order.findMany({
      where: { items: { some: { product: { sellerId: session.user.id } } } },
      include: { items: { include: { product: { select: { title: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    // Order items belonging to this seller from completed orders (for earnings)
    prisma.orderItem.findMany({
      where: {
        product: { sellerId: session.user.id },
        order: { status: { in: ['PAID', 'SHIPPED', 'DELIVERED', 'PICKED_UP'] } },
      },
      include: {
        product: { select: { title: true, id: true } },
        order: { select: { id: true, status: true, createdAt: true, shippingCents: true } },
      },
      orderBy: { order: { createdAt: 'desc' } },
    }),
  ]);

  // Compute earnings from seller's completed order items
  const grossSalesCents = soldItems.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const platformFeesCents = soldItems.reduce((s, i) => s + i.commissionFeeCents, 0);
  const netEarningsCents = soldItems.reduce((s, i) => s + i.sellerNetCents, 0);
  const itemsSoldCount = soldItems.reduce((s, i) => s + i.quantity, 0);
  const completedOrdersCount = new Set(soldItems.map(i => i.order.id)).size;

  // Fetch Stripe onboarding state from DB (not the JWT, which is set only at
  // login and would be stale immediately after the seller returns from Stripe).
  const stripeOnboarded = dbUser?.stripeOnboardingComplete ?? false;
  const stripeAccountId = dbUser?.stripeAccountId ?? null;
  const stripeAccountMode = dbUser?.stripeAccountMode ?? null;
  const currentStripeMode = getCurrentStripeMode();
  // stripeInProgress: seller has started onboarding but not yet completed it
  const stripeInProgress = !!stripeAccountId && !stripeOnboarded;

  // When onboarding is in progress, verify the saved account exists in the
  // current Stripe mode. This catches test-mode account IDs after switching
  // to live keys. If payouts are already enabled (e.g. the account.updated
  // webhook was missed), sync the DB and redirect with success status.
  let stripeAccountStale = false;
  let stripeRuntimeIssueReason: string | null = null;
  if (stripeInProgress && stripeAccountId) {
    if (stripeAccountMode && currentStripeMode && stripeAccountMode !== currentStripeMode) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { stripeAccountId: null, stripeAccountMode: null, stripeOnboardingComplete: false },
      });
      redirect('/seller?stripe=error&reason=stale_account');
    }
    try {
      const acct = await stripe.accounts.retrieve(stripeAccountId);
      const resolvedMode = modeFromStripeLivemode(acct.livemode);
      if (stripeAccountMode !== resolvedMode) {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { stripeAccountMode: resolvedMode },
        });
      }
      if (acct.payouts_enabled) {
        // Missed webhook — sync the DB and show the connected banner.
        await prisma.user.update({
          where: { id: session.user.id },
          data: { stripeOnboardingComplete: true },
        });
        redirect('/seller?stripe=connected');
      }
    } catch (err) {
      const reason = classifyStripeError(err).reason;
      if (reason === 'stale_account') {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { stripeAccountId: null, stripeAccountMode: null, stripeOnboardingComplete: false },
        });
        redirect('/seller?stripe=error&reason=stale_account');
      } else {
        stripeRuntimeIssueReason = reason;
        console.error('[seller/page] stripe.accounts.retrieve error:', err);
      }
      stripeAccountStale = reason === 'stale_account';
    }
  }

  let stripeAvailableCents: number | null = null;
  let stripePendingCents: number | null = null;
  if (stripeOnboarded && stripeAccountId) {
    try {
      const balance = await stripe.balance.retrieve(
        {} as any,
        { stripeAccount: stripeAccountId },
      );
      stripeAvailableCents = (balance.available as Array<{ currency: string; amount: number }>)
        .reduce((s, b) => s + (b.currency === 'usd' ? b.amount : 0), 0);
      stripePendingCents = (balance.pending as Array<{ currency: string; amount: number }>)
        .reduce((s, b) => s + (b.currency === 'usd' ? b.amount : 0), 0);
    } catch {
      stripeRuntimeIssueReason = stripeRuntimeIssueReason ?? 'stripe_error';
      // Stripe not available or account not fully set up; balances remain null
    }
  }

  return (
    <main className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black">Seller Dashboard</h1>
          <p className="text-slate-500 text-sm">Welcome back, {session.user.name}</p>
        </div>
        {!isRestricted && <Link href="/seller/new" className="btn-primary">+ New listing</Link>}
      </div>

      {isRestricted && (
        <div className="card p-5 mb-6 bg-red-50 border-red-200 text-red-800">
          <p className="font-semibold mb-1">Your seller account has been restricted.</p>
          <p className="text-sm">
            Your account is currently under review and certain seller features are
            unavailable. If you believe this is an error, please contact support.
          </p>
        </div>
      )}

      {sp.created && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Product submitted for review! It will appear publicly once approved by an admin.
        </div>
      )}

      {sp.updated && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Listing updated and re-submitted for review.
        </div>
      )}

      {sp.deleted && (
        <div className="card p-4 mb-6 bg-slate-50 border-slate-200 text-slate-700 text-sm">
          🗑️ Listing deleted.
        </div>
      )}

      {sp.stripe === 'connected' && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Stripe account connected! You&apos;re now set up to receive payouts.
        </div>
      )}

      {sp.stripe === 'error' && (
        <div className="card p-4 mb-6 bg-red-50 border-red-200 text-red-800 text-sm">
          {sp.reason === 'invalid_key' && '❌ Stripe keys are misconfigured on the platform. Please contact support/admin.'}
          {sp.reason === 'platform_incomplete' && '❌ Stripe platform setup is incomplete. Please contact support/admin.'}
          {sp.reason === 'stale_account' && '❌ Your saved Stripe account is no longer valid in this mode. Reconnect your payout account.'}
          {!sp.reason && '❌ Something went wrong connecting your Stripe account. Please try again or contact support.'}
          {sp.reason === 'stripe_error' && '❌ Stripe is temporarily unavailable. Please try again later.'}
        </div>
      )}

      {stripeRuntimeIssueReason && (
        <div className="card p-4 mb-6 bg-red-50 border-red-200 text-red-800 text-sm">
          {stripeRuntimeIssueReason === 'invalid_key' && '❌ Platform Stripe credentials are invalid. Please contact support/admin.'}
          {stripeRuntimeIssueReason === 'platform_incomplete' && '❌ Platform Stripe profile/setup is incomplete. Please contact support/admin.'}
          {stripeRuntimeIssueReason === 'stripe_error' && '❌ Stripe is temporarily unavailable. Please retry shortly.'}
        </div>
      )}

      {/* Not started OR stale account that needs to be recreated */}
      {!isRestricted && !stripeOnboarded && (!stripeInProgress || stripeAccountStale) && (
        <div className="card p-4 mb-6 bg-yellow-50 border-yellow-200 text-yellow-800 text-sm flex justify-between items-center gap-3">
          <span>⚠️ Connect your bank account via Stripe to receive payouts.</span>
          <a href="/api/stripe/connect" className="btn-outline text-xs flex-shrink-0">Connect bank account</a>
        </div>
      )}

      {/* Valid in-progress account — show resume prompt */}
      {!isRestricted && stripeInProgress && !stripeAccountStale && (
        <div className="card p-4 mb-6 bg-blue-50 border-blue-200 text-blue-800 text-sm flex justify-between items-center gap-3">
          <span>🔄 Stripe setup in progress — complete your bank account details to receive payouts.</span>
          <a href="/api/stripe/connect" className="btn-outline text-xs flex-shrink-0">Resume setup</a>
        </div>
      )}

      {/* ── Earnings Summary ── */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3">Earnings Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <StatCard label="Items Sold" value={String(itemsSoldCount)} sub="paid/shipped/delivered" />
          <StatCard label="Orders" value={String(completedOrdersCount)} sub="completed" />
          <StatCard label="Gross Sales" value={dollars(grossSalesCents)} sub="before fees" />
          <StatCard label="Platform Fees" value={`−${dollars(platformFeesCents)}`} sub={`${formatCommissionPercent(settings.defaultSellerCommissionBps)} default commission`} />
          <StatCard label="Net Earnings" value={dollars(netEarningsCents)} sub="after fees" />
          {stripeOnboarded ? (
            stripeAvailableCents !== null ? (
              <div className="card p-5 flex flex-col gap-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Stripe Balance</p>
                <p className="text-2xl font-black text-slate-900">{dollars(stripeAvailableCents)}</p>
                <p className="text-xs text-slate-400">available · {dollars(stripePendingCents ?? 0)} pending</p>
              </div>
            ) : (
              <div className="card p-5 flex flex-col gap-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Stripe Balance</p>
                <p className="text-sm text-slate-400 mt-1">Unavailable — check your Stripe dashboard</p>
              </div>
            )
          ) : (
            <div className="card p-5 flex flex-col gap-1 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Stripe Balance</p>
              <p className="text-sm text-slate-400 mt-1">Connect Stripe to see your payout balance</p>
            </div>
          )}
        </div>
        {stripeOnboarded && (
          <p className="text-xs text-slate-400">
            Stripe balance reflects your connected account. <a href="/api/stripe/connect" className="text-blue-500 hover:underline">Open Stripe dashboard →</a>
          </p>
        )}
      </section>

      {/* ── Sold Items ── */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3">Sold Items</h2>
        {soldItems.length === 0 ? (
          <div className="card p-6 text-slate-500">No items sold yet.</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Item</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Date</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 text-right">Qty</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 text-right">Item Price</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 text-right">Commission</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 text-right">Net Payout</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {soldItems.map(item => (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 truncate max-w-[160px]">{item.product.title}</td>
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                      {item.order.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{dollars(item.priceCents * item.quantity)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">−{dollars(item.commissionFeeCents)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">{dollars(item.sellerNetCents)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`badge ${orderStatusBadge(item.order.status)}`}>{item.order.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── My Listings ── */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3">My Listings</h2>
        {products.length === 0 ? (
          <div className="card p-6 text-slate-500">No listings yet. <Link href="/seller/new" className="text-blue-600 hover:underline">Create one</Link>.</div>
        ) : (
          <div className="space-y-3">
            {products.map(p => {
              const activePromo = p.promotions[0] ?? null;
              return (
                <div key={p.id} className="card p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{p.title}</p>
                      {activePromo && (
                        <span className="badge badge-blue flex-shrink-0">Boosted until {activePromo.expiresAt ? activePromo.expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">{p.condition} · {p.category} · {dollars(p.priceCents)}</p>
                  </div>
                  <span className={statusBadge(p.status)}>{p.status}</span>
                  <div className="flex gap-2 flex-shrink-0">
                    {p.status === 'APPROVED' && !activePromo && !isRestricted && (
                      <Link href={`/seller/promote/${p.id}`} className="btn bg-yellow-500 hover:bg-yellow-600 text-white text-xs py-1 px-2">⭐ Promote</Link>
                    )}
                    {p.status !== 'SOLD' && (
                      <Link href={`/seller/edit/${p.id}`} className="btn-outline text-xs py-1 px-2">Edit</Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Recent Orders (for shipping management) ── */}
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
                {/* Shipping form for non-pickup PAID orders */}
                {o.status === 'PAID' && !o.isPickup && !isRestricted && (
                  <form action="/api/seller/ship" method="POST" className="mt-3 flex gap-2">
                    <input type="hidden" name="orderId" value={o.id} />
                    <input name="trackingNumber" className="input flex-1" placeholder="Tracking number" />
                    <input name="shippingCarrier" className="input w-24" placeholder="Carrier" />
                    <button type="submit" className="btn-primary text-sm">Mark Shipped</button>
                  </form>
                )}
                {/* Pickup verification for pickup orders */}
                {o.isPickup && ['PAID', 'READY_FOR_PICKUP'].includes(o.status) && !isRestricted && (
                  <div className="mt-3">
                    <p className="text-xs text-slate-500 mb-2">📦 Pickup order — verify the buyer&apos;s code at handoff:</p>
                    <PickupVerifyForm orderId={o.id} />
                  </div>
                )}
                {o.isPickup && o.status === 'PICKED_UP' && (
                  <p className="text-xs text-green-700 mt-2 font-medium">✅ Pickup confirmed</p>
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
