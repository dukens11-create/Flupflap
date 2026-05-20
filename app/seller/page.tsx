import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { DEFAULT_DATE_FORMAT_OPTIONS } from '@/lib/date-format';
import { dollars } from '@/lib/money';
import { formatCommissionPercent, getMarketplaceSettings, getStoredLineSubtotalCents } from '@/lib/commission';
import { classifyStripeError, getCurrentStripeMode, stripe } from '@/lib/stripe';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import PickupVerifyForm from '@/components/PickupVerifyForm';
import { expirePromotions, getPromotionLabel } from '@/lib/promotions';
import { isSubscriptionActive, SELLER_SUBSCRIPTION_PRICE_LABEL } from '@/lib/subscription';
import { syncSellerSubscriptionFromStripe } from '@/lib/subscription-sync';
import SubscriptionButton from '@/components/SubscriptionButton';
import { getInboxConversations, getSellerResponseStats, SELLER_RESPONSE_WINDOW_HOURS } from '@/lib/messages';
import { getFreePromotionDaysLeft, isFreePromotionEligible } from '@/lib/free-promotion';
import {
  isSellerVerificationApproved,
  sellerVerificationStatusTone,
} from '@/lib/seller-verification';
import { buildTrackingUrl } from '@/lib/shipping';
import SellerShippingLabelForm from '@/components/SellerShippingLabelForm';
import KycVerifyButton from '@/components/KycVerifyButton';
import StripeConnectButton from '@/components/StripeConnectButton';
import SellerListingsGrid from '@/components/SellerListingsGrid';
import SellerShopProfileForm from '@/components/SellerShopProfileForm';
import SellerPhoneVerificationCard from '@/components/SellerPhoneVerificationCard';
import {
  formatPackageDisplay,
  getEffectivePackageDetails,
  hasStoredPackageDetails,
} from '@/lib/product-package';
import { toSellerLifecycleStatus } from '@/lib/listing-status';
import { normalizeOrderStatus, ORDER_STATUS_BADGE_CLASSES } from '@/lib/order-status';
import { getRoleNavigation } from '@/lib/role-experience';
import { isSchemaNotInitializedError } from '@/lib/db-errors';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Seller Dashboard' };

type SellerWorkspaceView =
  | 'dashboard'
  | 'my-listings'
  | 'sales'
  | 'orders-to-ship'
  | 'payouts'
  | 'promotions'
  | 'verification-status'
  | 'shop-by-culture';

type ListingsState = 'drafts' | 'scheduled' | 'active' | 'sold' | 'archived';

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

function listingStatusLabel(status: string, inventory: number): string {
  if (status === 'APPROVED' && inventory > 0) return 'Active';
  if (status === 'APPROVED' && inventory === 0) return 'Out of stock';
  if (status === 'HIDDEN') return 'Delisted';
  if (status === 'SOLD') return 'Out of stock';
  // Format any other status: replace underscores, title-case each word
  return status
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function listingStatusBadgeClass(status: string, inventory: number): string {
  if (status === 'APPROVED' && inventory > 0) return 'badge-green';
  if (status === 'APPROVED' && inventory === 0) return 'badge-yellow';
  if (status === 'HIDDEN') return 'badge-red';
  if (status === 'SOLD') return 'badge-yellow';
  return statusBadge(status);
}

/** Returns "X.X%" when views > 0, null otherwise. */
function calcConversionRate(orders: number, views: number): string | null {
  if (views <= 0) return null;
  return ((orders / views) * 100).toFixed(1);
}

function orderStatusBadge(status: string) {
  return ORDER_STATUS_BADGE_CLASSES[status] ?? 'badge-yellow';
}

function sellerVerificationStatusLabel(status?: string | null) {
  if (!status) return 'not started';
  if (status === 'APPROVED') return 'verified';
  if (status === 'REJECTED') return 'rejected';
  return 'pending review';
}

function normalizeSellerView(value: string | undefined): SellerWorkspaceView {
  const views: SellerWorkspaceView[] = [
    'dashboard',
    'my-listings',
    'sales',
    'orders-to-ship',
    'payouts',
    'promotions',
    'verification-status',
    'shop-by-culture',
  ];
  if (value && views.includes(value as SellerWorkspaceView)) {
    return value as SellerWorkspaceView;
  }
  return 'dashboard';
}

function normalizeListingsState(value: string | undefined): ListingsState {
  const states: ListingsState[] = ['drafts', 'scheduled', 'active', 'sold', 'archived'];
  if (value && states.includes(value as ListingsState)) {
    return value as ListingsState;
  }
  return 'active';
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

function stripeAccountStatus(account: {
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  requirements?: {
    currently_due?: string[] | null;
    past_due?: string[] | null;
    disabled_reason?: string | null;
  } | null;
}) {
  return {
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
    requirementsDue: account.requirements?.currently_due ?? [],
    requirementsPastDue: account.requirements?.past_due ?? [],
    disabledReason: account.requirements?.disabled_reason ?? null,
  };
}

export default async function SellerPage({ searchParams }: { searchParams: Promise<{ created?: string; stripe?: string; reason?: string; updated?: string; deleted?: string; promoted?: string; subscribed?: string; subscribe?: string; verification?: string; fraud?: string; view?: string; state?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');
  const sellerId = session.user.id;
  if (!sellerId) redirect('/login');
  const sp = await searchParams;
  const currentView = normalizeSellerView(sp.view);
  const listingsState = normalizeListingsState(sp.state);
  const isDashboardView = currentView === 'dashboard';
  const isListingsView = currentView === 'my-listings';
  const isSalesView = currentView === 'sales';
  const isOrdersView = currentView === 'orders-to-ship';
  const isPayoutsView = currentView === 'payouts';
  const isPromotionsView = currentView === 'promotions';
  const isVerificationView = currentView === 'verification-status';
  const isShopByCultureView = currentView === 'shop-by-culture';
  const subscribedFromCheckout = sp.subscribed === '1';

  // Fetch full user to check seller status (session JWT may be stale)
  try {
  let dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
  const hasStoredSubscriptionCustomer = !!dbUser?.stripeCustomerId;
  const subscriptionLooksInactive = dbUser ? !isSubscriptionActive(dbUser) : false;
  const shouldAttemptSubscriptionRecovery = subscribedFromCheckout && hasStoredSubscriptionCustomer && subscriptionLooksInactive;
  if (shouldAttemptSubscriptionRecovery && dbUser) {
    try {
      const synced = await syncSellerSubscriptionFromStripe(dbUser.id);
      if (synced) {
        dbUser = {
          ...dbUser,
          ...synced,
        };
      }
    } catch (err) {
      console.error('[seller/page] subscription recovery sync failed:', err);
    }
  }
  const sellerStatus = dbUser?.sellerStatus ?? 'ACTIVE';
  const isRestricted = sellerStatus === 'SUSPENDED' || sellerStatus === 'BANNED' || sellerStatus === 'RESTRICTED';
  const subscriptionActive = dbUser ? isSubscriptionActive(dbUser) : false;
  const subscriptionPeriodEnd = dbUser?.subscriptionCurrentPeriodEnd ?? null;
  const subscriptionStatus = dbUser?.subscriptionStatus ?? null;
  const settings = await getMarketplaceSettings();
  const freePromotionEligible = settings.freePromotionEnabled && !!dbUser && isFreePromotionEligible(dbUser);
  const freePromotionExpiresAt = dbUser?.freePromotionEnd ?? dbUser?.freePromotionExpiresAt ?? null;
  const freePromotionDaysLeft = dbUser ? getFreePromotionDaysLeft(dbUser) : 0;
  const freePromotionExpired = !freePromotionEligible && !!freePromotionExpiresAt && freePromotionExpiresAt < new Date();
  const freePromotionExpiresAtFormatted = freePromotionExpiresAt
    ? freePromotionExpiresAt.toLocaleDateString('en-US', DEFAULT_DATE_FORMAT_OPTIONS)
    : null;
  await expirePromotions();
  const [products, orders, soldItems, verificationSubmission, promotionHistory] = await Promise.all([
    prisma.product.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        category: true,
        condition: true,
        priceCents: true,
        status: true,
        inventory: true,
        imageUrl: true,
        createdAt: true,
        viewCount: true,
        soldQty: true,
        publishedAt: true,
        weightOz: true,
        weightUnit: true,
        lengthIn: true,
        widthIn: true,
        heightIn: true,
        packageType: true,
        productAttributes: true,
        promotions: {
          where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: 'desc' },
          take: 1,
          select: {
            status: true,
            expiresAt: true,
          },
        },
        cartInterest: {
          select: {
            totalAdds: true,
            lastAddedAt: true,
          },
        },
      },
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
      take: 20,
    }),
    // Order items belonging to this seller from completed orders (for earnings)
    prisma.orderItem.findMany({
      where: {
        product: { sellerId },
        order: { status: { in: ['PAID', 'SHIPPED', 'DELIVERED', 'PICKED_UP'] } },
      },
      include: {
        product: { select: { title: true, id: true } },
        order: { select: { id: true, status: true, createdAt: true, shippingCents: true } },
      },
      orderBy: { order: { createdAt: 'desc' } },
    }),
    prisma.sellerVerification.findUnique({
      where: { sellerId },
      select: {
        provider: true,
        providerStatus: true,
        providerInquiryId: true,
        providerVerificationId: true,
        status: true,
        rejectionReason: true,
        governmentIdVerified: true,
        selfieVerified: true,
        addressVerified: true,
        phoneVerified: true,
        phoneNumber: true,
        phoneVerificationStatus: true,
        street: true,
        city: true,
        state: true,
        zipCode: true,
        country: true,
        createdAt: true,
        updatedAt: true,
        kycStartedAt: true,
        eligibleToListAt: true,
        adminFallbackStatus: true,
        adminFallbackReason: true,
      },
    }),
    prisma.promotion.findMany({
      where: { sellerId },
      include: {
        product: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Compute earnings from seller's completed order items
  const grossSalesCents = soldItems.reduce((s, i) => s + getStoredLineSubtotalCents(i), 0);
  const platformFeesCents = soldItems.reduce((s, i) => s + i.commissionFeeCents, 0);
  const netEarningsCents = soldItems.reduce((s, i) => s + i.sellerNetCents, 0);
  const itemsSoldCount = soldItems.reduce((s, i) => s + i.quantity, 0);
  const completedOrdersCount = new Set(soldItems.map(i => i.order.id)).size;

  // Compute weekly / monthly product statistics
  const statsNow = new Date();
  const weekStart = new Date(statsNow);
  weekStart.setDate(statsNow.getDate() - (statsNow.getDay() + 6) % 7);
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(statsNow.getFullYear(), statsNow.getMonth(), 1);

  const productsAddedThisWeek = products.filter(p => p.createdAt >= weekStart).length;
  const productsAddedThisMonth = products.filter(p => p.createdAt >= monthStart).length;
  const activeListingsCount = products.filter((p) => toSellerLifecycleStatus(p.status) === 'ACTIVE').length;
  const pendingListingsCount = products.filter((p) => toSellerLifecycleStatus(p.status) === 'DRAFT').length;
  const totalCartAdds = products.reduce((sum, product) => sum + (product.cartInterest?.totalAdds ?? 0), 0);
  const totalViewCount = products.reduce((sum, p) => sum + (p.viewCount ?? 0), 0);
  const totalSoldQty = products.reduce((sum, p) => sum + (p.soldQty ?? 0), 0);
  const totalRemainingStock = products.reduce((sum, p) => sum + (toSellerLifecycleStatus(p.status) === 'ACTIVE' ? p.inventory : 0), 0);
  // Conversion rate = unique purchase transactions / total views (not units, to avoid >100%)
  const overallConversionRate = calcConversionRate(completedOrdersCount, totalViewCount);
  // Per-product: count of distinct order IDs per product (used for per-listing conversion rate)
  const orderCountByProductId = soldItems.reduce((acc, item) => {
    const key = item.product.id;
    if (!acc.has(key)) acc.set(key, new Set<string>());
    acc.get(key)!.add(item.order.id);
    return acc;
  }, new Map<string, Set<string>>());
  const soldItemsThisWeek = soldItems.filter(i => i.order.createdAt >= weekStart);
  const soldItemsThisMonth = soldItems.filter(i => i.order.createdAt >= monthStart);
  const soldCountThisWeek = soldItemsThisWeek.reduce((s, i) => s + i.quantity, 0);
  const soldCountThisMonth = soldItemsThisMonth.reduce((s, i) => s + i.quantity, 0);
  const revenueThisWeekCents = soldItemsThisWeek.reduce((s, i) => s + i.sellerNetCents, 0);
  const revenueThisMonthCents = soldItemsThisMonth.reduce((s, i) => s + i.sellerNetCents, 0);
  const pendingOrdersToShip = orders.filter((order) => order.status === 'PAID').length;
  const verificationApproved = isSellerVerificationApproved(verificationSubmission);
  const inboxConversations = await getInboxConversations(sellerId);
  const unreadInboxCount = inboxConversations.reduce(
    (sum, conversation) => sum + conversation.unreadCount,
    0,
  );
  const sellerResponseStats = await getSellerResponseStats(sellerId);
  let emptyListingsMessage: ReactNode = 'No listings yet. Subscribe to start selling.';
  if (subscriptionActive && verificationApproved) {
    emptyListingsMessage = (
        <span>
          No listings yet. <Link href="/seller/listings/new" className="text-blue-600 hover:underline">Create one</Link>.
        </span>
    );
  } else if (subscriptionActive) {
    emptyListingsMessage = 'No listings yet. Complete seller verification to start selling.';
  }
  const incompleteShippingProducts = products.filter((product) => !hasStoredPackageDetails(product));
  const shippingReadyCount = products.length - incompleteShippingProducts.length;
  const activeListings = products.filter((p) => p.status === 'APPROVED' && p.inventory > 0);
  const soldListings = products.filter((p) => p.status === 'SOLD' || (p.status === 'APPROVED' && p.inventory === 0));
  const archivedListings = products.filter((p) => p.status === 'HIDDEN');
  const draftListings = products.filter((p) => p.status === 'PENDING' || p.status === 'REJECTED');
  const scheduledListings: typeof products = [];
  const listingsByState: Record<ListingsState, typeof products> = {
    drafts: draftListings,
    scheduled: scheduledListings,
    active: activeListings,
    sold: soldListings,
    archived: archivedListings,
  };
  const selectedListings = listingsByState[listingsState];
  const listingsStateCounts: Record<ListingsState, number> = {
    drafts: draftListings.length,
    scheduled: scheduledListings.length,
    active: activeListings.length,
    sold: soldListings.length,
    archived: archivedListings.length,
  };
  const viewHeading: Record<SellerWorkspaceView, string> = {
    dashboard: 'Seller Dashboard',
    'my-listings': 'My Listings',
    sales: 'Sales',
    'orders-to-ship': 'Orders to Ship',
    payouts: 'Payouts',
    promotions: 'Promotions',
    'verification-status': 'Verification Status',
    'shop-by-culture': 'Shop by Culture',
  };
  const workspaceLinks = getRoleNavigation('SELLER');

  // Fetch Stripe onboarding state from DB (not the JWT, which is set only at
  // login and would be stale immediately after the seller returns from Stripe).
  const stripeOnboarded = dbUser?.stripeOnboardingComplete ?? false;
  const stripeAccountId = dbUser?.stripeAccountId ?? null;
  const stripeAccountMode = dbUser?.stripeAccountMode ?? null;
  const currentStripeMode = getCurrentStripeMode();
  // stripeInProgress: seller has started onboarding but not yet completed it
  const stripeInProgress = !!stripeAccountId && !stripeOnboarded;
  let stripeChargesEnabled: boolean | null = null;
  let stripePayoutsEnabled: boolean | null = null;
  let stripeRequirementsDue: string[] = [];
  let stripeRequirementsPastDue: string[] = [];
  let stripeDisabledReason: string | null = null;

  // When onboarding is in progress, verify the saved account exists in the
  // current Stripe mode. This catches test-mode account IDs after switching
  // to live keys. If payouts are already enabled (e.g. the account.updated
  // webhook was missed), sync the DB and redirect with success status.
  let stripeRuntimeIssueReason: string | null = null;
  if (stripeInProgress && stripeAccountId) {
    if (stripeAccountMode && currentStripeMode && stripeAccountMode !== currentStripeMode) {
      await prisma.user.update({
        where: { id: sellerId },
        data: { stripeAccountId: null, stripeAccountMode: null, stripeOnboardingComplete: false },
      });
      redirect('/seller?stripe=error&reason=stale_account');
    }
    try {
      const acct = await stripe.accounts.retrieve(stripeAccountId);
      const status = stripeAccountStatus(acct);
      stripeChargesEnabled = status.chargesEnabled;
      stripePayoutsEnabled = status.payoutsEnabled;
      stripeRequirementsDue = status.requirementsDue;
      stripeRequirementsPastDue = status.requirementsPastDue;
      stripeDisabledReason = status.disabledReason;
      if (acct.payouts_enabled) {
        // Missed webhook — sync the DB and show the connected banner.
        await prisma.user.update({
          where: { id: sellerId },
          data: { stripeOnboardingComplete: true },
        });
        redirect('/seller?stripe=connected');
      }
    } catch (err) {
      const reason = classifyStripeError(err).reason;
      if (reason === 'stale_account') {
        await prisma.user.update({
          where: { id: sellerId },
          data: { stripeAccountId: null, stripeAccountMode: null, stripeOnboardingComplete: false },
        });
        redirect('/seller?stripe=error&reason=stale_account');
      } else {
        stripeRuntimeIssueReason = reason;
        console.error('[seller/page] stripe.accounts.retrieve error:', err);
      }
    }
  }

  let stripeAvailableCents: number | null = null;
  let stripePendingCents: number | null = null;
  if (stripeOnboarded && stripeAccountId) {
    try {
      const acct = await stripe.accounts.retrieve(stripeAccountId);
      const status = stripeAccountStatus(acct);
      stripeChargesEnabled = status.chargesEnabled;
      stripePayoutsEnabled = status.payoutsEnabled;
      stripeRequirementsDue = status.requirementsDue;
      stripeRequirementsPastDue = status.requirementsPastDue;
      stripeDisabledReason = status.disabledReason;

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
          <h1 className="text-3xl font-black">{viewHeading[currentView]}</h1>
          <p className="text-slate-500 text-sm">Welcome back, {session.user.name}</p>
        </div>
      </div>

      {isDashboardView && (
        <section id="sales-overview" className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-5">
        <StatCard label="Total Sales" value={dollars(grossSalesCents)} />
        <StatCard label="Active Listings" value={String(activeListingsCount)} />
        <StatCard label="Pending Orders" value={String(pendingOrdersToShip)} />
        <div id="promotion-status" className="card p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Promotion Status</p>
          <p className={`mt-2 text-sm font-semibold ${freePromotionEligible ? 'text-indigo-700' : 'text-slate-500'}`}>
            {freePromotionEligible
              ? `Free promotion active (${freePromotionDaysLeft} day${freePromotionDaysLeft === 1 ? '' : 's'} left)`
              : freePromotionExpired
                ? `Free promotion expired`
                : 'No free promotion'}
          </p>
        </div>
        <div id="seller-health" className="card p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Verification Status</p>
          <p className="mt-2 text-sm font-semibold text-slate-700">{sellerVerificationStatusLabel(verificationSubmission?.status)}</p>
        </div>
        </section>
      )}

      {isDashboardView && (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">Quick Access</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {workspaceLinks.filter((link) => link.href !== '/seller/dashboard').map((link) => (
              <Link key={link.href} href={link.href} className="card p-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {isRestricted && (
        <div className="card p-5 mb-6 bg-red-50 border-red-200 text-red-800">
          <p className="font-semibold mb-1">Your seller account has been restricted.</p>
          <p className="text-sm">
            Your account is currently under review and certain seller features are
            unavailable. If you believe this is an error, please contact support.
          </p>
        </div>
      )}

      {(isDashboardView || isVerificationView) && sp.verification === 'submitted' && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Seller verification submitted. You&apos;ll be automatically approved once required checks pass. Admin review is only used as fallback when checks are incomplete or fail.
        </div>
      )}
      {(isDashboardView || isVerificationView) && sp.verification === 'provider_started' && (
        <div className="card p-4 mb-6 bg-blue-50 border-blue-200 text-blue-900 text-sm">
          ✅ Provider verification has been started. Complete all provider steps, then return to this dashboard to track status updates.
        </div>
      )}
      {(isDashboardView || isVerificationView) && sp.verification === 'provider_pending' && (
        <div className="card p-4 mb-6 bg-amber-50 border-amber-300 text-amber-900 text-sm">
          Identity verification is in progress. Listings remain locked until your identity is verified.
        </div>
      )}

      {(isDashboardView || isVerificationView) && sp.verification === 'required' && (
        <div className="card p-4 mb-6 bg-amber-50 border-amber-300 text-amber-900 text-sm">
          Submit and pass seller verification before creating product listings.
        </div>
      )}
      {(isDashboardView || isListingsView) && sp.fraud === 'review' && (
        <div className="card p-4 mb-6 bg-amber-50 border-amber-300 text-amber-900 text-sm">
          Your latest listing triggered extra trust-and-safety review signals (for example duplicate content, unusual pricing, or rapid posting). An admin will review it before it goes live.
        </div>
      )}

      {(isDashboardView || isVerificationView) && !isRestricted && (
        <section id="verification-status" className="card p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-slate-900">Seller Identity Verification</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`badge ${sellerVerificationStatusTone(verificationSubmission?.status)}`}>
                  {sellerVerificationStatusLabel(verificationSubmission?.status)}
                </span>
                {verificationSubmission?.kycStartedAt && (
                  <span className="text-xs text-slate-400">
                    Submitted {verificationSubmission.kycStartedAt.toLocaleDateString('en-US', DEFAULT_DATE_FORMAT_OPTIONS)}
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-slate-600 max-w-2xl">
                To sell on FlupFlap, verify your identity with a government ID and selfie.
              </p>
              {!verificationSubmission && (
                <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  You haven&apos;t started identity verification yet. Click <span className="font-semibold">Verify Identity</span> to begin.
                </p>
              )}
              {verificationSubmission?.status === 'REJECTED' && verificationSubmission.rejectionReason && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <p className="font-semibold mb-1">Verification was rejected:</p>
                  <p>{verificationSubmission.rejectionReason}</p>
                  <p className="mt-2 text-xs text-red-700">Please re-submit your documents to proceed.</p>
                </div>
              )}
              {verificationSubmission?.status === 'REJECTED' && !verificationSubmission.rejectionReason && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  Verification was rejected. Please re-submit your verification details to continue.
                </p>
              )}
              {verificationSubmission?.status === 'APPROVED' && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                  <span className="text-sm font-semibold text-green-800" aria-label="Verified Seller">&#10003; Verified Seller</span>
                  <p className="text-sm text-green-700">Your identity has been verified. You can create listings once your subscription is active.</p>
                </div>
              )}
              {verificationSubmission?.status === 'PENDING' && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Your verification is pending while Stripe Identity checks finish syncing.
                </p>
              )}
              {!verificationApproved && !dbUser?.phoneVerified && (
                <SellerPhoneVerificationCard />
              )}
              {!verificationApproved && dbUser?.phoneVerified && (
                <KycVerifyButton isRejected={verificationSubmission?.status === 'REJECTED'} />
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Shop Profile ── */}
      {isDashboardView && !isRestricted && (
        <section id="shop-profile" className="card p-6 mb-6">
          <div className="mb-4">
            <p className="text-lg font-semibold text-slate-900">Shop Profile</p>
            <p className="text-sm text-slate-500 mt-1">
              Your shop name and logo are shown to buyers on product listings instead of your personal name.
            </p>
          </div>
          <SellerShopProfileForm
            initialShopName={dbUser?.shopName ?? null}
            initialShopLogoUrl={dbUser?.shopLogoUrl ?? null}
            initialShopDescription={dbUser?.shopDescription ?? null}
            initialShipFromName={dbUser?.shipFromName ?? null}
            initialShipFromStreet={dbUser?.shipFromStreet ?? null}
            initialShipFromCity={dbUser?.shipFromCity ?? null}
            initialShipFromState={dbUser?.shipFromState ?? null}
            initialShipFromZip={dbUser?.shipFromZip ?? null}
            initialShipFromCountry={dbUser?.shipFromCountry ?? null}
            initialShipFromPhone={dbUser?.shipFromPhone ?? null}
          />
        </section>
      )}

      {/* ── Seller Subscription ── */}
      {isDashboardView && !isRestricted && !subscriptionActive && (
        <div className="card p-5 mb-6 bg-amber-50 border-amber-300 text-amber-900">
          <p className="font-semibold mb-1">
            {subscriptionStatus === 'PAST_DUE'
              ? '⚠️ Your seller subscription payment failed.'
              : subscriptionStatus === 'CANCELLED'
                ? '⚠️ Your seller subscription has been cancelled.'
                : '🔒 Seller subscription required.'}
          </p>
          <p className="text-sm mb-3">
            {subscriptionStatus === 'PAST_DUE'
              ? 'Please update your payment method to continue listing items on FlupFlap.'
              : subscriptionStatus === 'CANCELLED'
                ? 'Reactivate your plan to create new listings and sell on FlupFlap.'
                : `A ${SELLER_SUBSCRIPTION_PRICE_LABEL} subscription is required to list and sell items on FlupFlap.`}
          </p>
          <SubscriptionButton
            hasBillingAccount={!!dbUser?.stripeCustomerId}
            status={subscriptionStatus}
          />
        </div>
      )}

      {isDashboardView && !isRestricted && subscriptionActive && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm flex justify-between items-center gap-3">
          <span>
              ✅ Seller subscription active
              {subscriptionPeriodEnd
                ? ` — renews ${subscriptionPeriodEnd.toLocaleDateString('en-US', DEFAULT_DATE_FORMAT_OPTIONS)}`
                : ''}
            </span>
          <SubscriptionButton hasBillingAccount={!!dbUser?.stripeCustomerId} status={subscriptionStatus} manage />
        </div>
      )}

      {isDashboardView && (
        <>
      {sp.created && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Product submitted for review! It will appear publicly once approved by an admin.
        </div>
      )}

      {unreadInboxCount > 0 && (
        <div className="card p-4 mb-6 bg-blue-50 border-blue-200 text-blue-900 text-sm flex justify-between items-center gap-3">
          <span>
            You have {unreadInboxCount} unread buyer message{unreadInboxCount === 1 ? '' : 's'} waiting in your inbox.
          </span>
          <Link href="/messages" className="btn-outline text-xs flex-shrink-0">
            Open inbox
          </Link>
        </div>
      )}

      {subscribedFromCheckout && subscriptionActive && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          🎉 Subscription activated! You can now list and sell items on FlupFlap.
        </div>
      )}
      {freePromotionEligible && freePromotionExpiresAt && (
        <div className="card p-4 mb-6 bg-blue-50 border-blue-200 text-blue-900 text-sm">
          Free Promotion Active — expires on {freePromotionExpiresAtFormatted} ({freePromotionDaysLeft} day{freePromotionDaysLeft === 1 ? '' : 's'} left).
        </div>
      )}
      {subscribedFromCheckout && !subscriptionActive && (
        <div className="card p-4 mb-6 bg-blue-50 border-blue-200 text-blue-900 text-sm">
          ✅ Payment received. Your subscription activation is still syncing. Please refresh in a few seconds.
        </div>
      )}

      {sp.updated && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Listing updated and re-submitted for review.
        </div>
      )}

      {sp.promoted === 'free' && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ⭐ Free promotion activated successfully.
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
          {sp.reason === 'invalid_key'
            ? '❌ Stripe keys are misconfigured on the platform. Please contact support/admin.'
            : sp.reason === 'platform_incomplete'
              ? '❌ Stripe platform setup is incomplete. Please contact support/admin.'
              : sp.reason === 'stale_account'
                ? '❌ Your saved Stripe account is no longer valid for this mode. Reconnect your payout account.'
                : sp.reason === 'stripe_error'
                  ? '❌ Stripe is temporarily unavailable. Please try again later.'
                  : '❌ Something went wrong connecting your Stripe account. Please try again or contact support.'}
        </div>
      )}

      {stripeRuntimeIssueReason && (
        <div className="card p-4 mb-6 bg-red-50 border-red-200 text-red-800 text-sm">
          {stripeRuntimeIssueReason === 'invalid_key' && '❌ Platform Stripe credentials are invalid. Please contact support/admin.'}
          {stripeRuntimeIssueReason === 'platform_incomplete' && '❌ Platform Stripe profile/setup is incomplete. Please contact support/admin.'}
          {stripeRuntimeIssueReason === 'stripe_error' && '❌ Stripe is temporarily unavailable. Please retry shortly.'}
          {stripeRuntimeIssueReason === 'stale_account' && '❌ Stripe account data is stale. Please reconnect your payout account.'}
        </div>
      )}

      {/* Not started OR stale account that needs to be recreated */}
      {/* Stale accounts are redirected/cleared before render, so this branch is only true for not-started onboarding. */}
      {!isRestricted && !stripeOnboarded && !stripeInProgress && (
        <div className="card p-4 mb-6 bg-yellow-50 border-yellow-200 text-yellow-800 text-sm flex justify-between items-center gap-3">
          <span>⚠️ Connect your bank account via Stripe to receive payouts.</span>
          <StripeConnectButton label="Connect Stripe" className="btn-outline text-xs flex-shrink-0" />
        </div>
      )}

      {/* Valid in-progress account — show resume prompt */}
      {!isRestricted && stripeInProgress && (
        <div className="card p-4 mb-6 bg-blue-50 border-blue-200 text-blue-800 text-sm flex justify-between items-center gap-3">
          <span>
            🔄 Stripe setup in progress — complete your bank account details to receive payouts.
            {stripeRequirementsDue.length > 0 && ` ${stripeRequirementsDue.length} requirement(s) still due.`}
            {stripeRequirementsPastDue.length > 0 && ` ${stripeRequirementsPastDue.length} requirement(s) are past due.`}
          </span>
          <StripeConnectButton label="Resume Stripe setup" className="btn-outline text-xs flex-shrink-0" />
        </div>
      )}
        </>
      )}

      {/* ── Earnings Summary ── */}
      {isPayoutsView && (
      <section id="payouts" className="mb-8">
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
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Stripe balance reflects your connected account.
            </p>
            <StripeConnectButton label="Open Stripe dashboard" className="btn-outline text-xs flex-shrink-0" />
          </div>
        )}
        {stripeAccountId && stripeChargesEnabled !== null && stripePayoutsEnabled !== null && (
          <p className="text-xs text-slate-500 mt-2">
            Stripe status: charges {stripeChargesEnabled ? 'enabled' : 'disabled'} · payouts {stripePayoutsEnabled ? 'enabled' : 'disabled'}
            {stripeDisabledReason ? ` · ${stripeDisabledReason.replaceAll('_', ' ')}` : ''}
          </p>
        )}
      </section>
      )}

      {/* ── Product Statistics ── */}
      {isSalesView && (
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3">Product Statistics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Listed This Week" value={String(productsAddedThisWeek)} sub="new products since Monday" />
          <StatCard label="Listed This Month" value={String(productsAddedThisMonth)} sub="new products this month" />
          <StatCard label="Active Listings" value={String(activeListingsCount)} sub="currently approved & live" />
          <StatCard label="Pending Listings" value={String(pendingListingsCount)} sub="awaiting admin review" />
          <StatCard label="Cart Adds" value={String(totalCartAdds)} sub="buyers adding your items to cart" />
          <StatCard label="Total Views" value={totalViewCount.toLocaleString()} sub="product page visits (excl. seller/admin)" />
          <StatCard label="Total Sold" value={totalSoldQty.toLocaleString()} sub="units sold across all listings" />
          <StatCard label="Remaining Stock" value={totalRemainingStock.toLocaleString()} sub="units available across active listings" />
          {overallConversionRate !== null && (
            <StatCard label="Conversion Rate" value={`${overallConversionRate}%`} sub="unique purchase orders ÷ views" />
          )}
          <StatCard label="Sold This Week" value={String(soldCountThisWeek)} sub="units from paid orders" />
          <StatCard label="Sold This Month" value={String(soldCountThisMonth)} sub="units from paid orders" />
          <StatCard label="Total Items Sold" value={String(itemsSoldCount)} sub="all time (paid orders)" />
          <StatCard label="Revenue This Week" value={dollars(revenueThisWeekCents)} sub="net payout after fees" />
          <StatCard label="Revenue This Month" value={dollars(revenueThisMonthCents)} sub="net payout after fees" />
          <StatCard
            label="Response Rate"
            value={
              sellerResponseStats.responseRate === null
                ? '—'
                : `${sellerResponseStats.responseRate}%`
            }
            sub={
              sellerResponseStats.responseRate === null
                ? 'needs more inbox history'
                : `${sellerResponseStats.respondedCount}/${sellerResponseStats.eligibleCount} buyer inquiries replied to within ${SELLER_RESPONSE_WINDOW_HOURS}h`
            }
          />
          <StatCard
            label="Awaiting Replies"
            value={String(sellerResponseStats.awaitingReplyCount)}
            sub="conversations where the latest message is from a buyer"
          />
        </div>
        {products.length === 0 && soldItems.length === 0 && (
          <p className="text-xs text-slate-400 mt-3">Statistics will populate once you have listings and sales.</p>
        )}
      </section>
      )}

      {/* ── Sold Items ── */}
      {isSalesView && (
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
                  <th className="px-4 py-3 font-semibold text-slate-600 text-right">Subtotal</th>
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
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      <div>{dollars(getStoredLineSubtotalCents(item))}</div>
                      <div className="text-xs font-normal text-slate-500">{dollars(item.priceCents)} each</div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      <div>−{dollars(item.commissionFeeCents)}</div>
                      <div className="text-xs text-slate-500">{formatCommissionPercent(item.commissionRateBps)}</div>
                    </td>
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
      )}

      {isListingsView && (
      <section id="shipping-package-details" className="mb-8">
        <h2 className="text-xl font-bold mb-3">Shipping & Package Details</h2>
        <div className="card p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-900">Keep package details complete for reliable Shippo rates.</p>
            <span className={`badge ${incompleteShippingProducts.length > 0 ? 'badge-yellow' : 'badge-green'}`}>
              {shippingReadyCount}/{products.length} ready
            </span>
          </div>
          {incompleteShippingProducts.length > 0 ? (
            <p className="text-sm text-slate-600">
              Shipping setup incomplete for {incompleteShippingProducts.length} listing{incompleteShippingProducts.length === 1 ? '' : 's'}.
              Use each listing&apos;s Edit button to update package details.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              All current listings have shipping package details saved.
            </p>
          )}
        </div>
      </section>
      )}

      {/* ── My Listings ── */}
      {isListingsView && (
      <section id="my-listings" className="mb-8">
        <h2 className="text-xl font-bold mb-3">My Listings</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {([
            ['drafts', 'Drafts'],
            ['scheduled', 'Scheduled'],
            ['active', 'Active'],
            ['sold', 'Sold'],
            ['archived', 'Archived'],
          ] as Array<[ListingsState, string]>).map(([stateKey, label]) => (
            <Link
              key={stateKey}
              href={`/seller/my-listings?state=${stateKey}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                listingsState === stateKey
                  ? 'bg-[var(--ff-primary-navy)] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label} <span className="text-[10px] opacity-80">{listingsStateCounts[stateKey]}</span>
            </Link>
          ))}
        </div>
        {listingsState === 'scheduled' && (
          <div className="card p-4 mb-4 text-sm text-slate-600">
            Scheduled listings will appear here once scheduling is configured for your account.
          </div>
        )}
        {selectedListings.length === 0 ? (
          <div className="card p-6 text-slate-500">
            {emptyListingsMessage}
          </div>
        ) : (
          <SellerListingsGrid
            isRestricted={isRestricted}
            listings={selectedListings.map(p => {
              const activePromo = p.promotions[0] ?? null;
              const cartAdds = p.cartInterest?.totalAdds ?? 0;
              const viewCount = p.viewCount ?? 0;
              const soldQty = p.soldQty ?? 0;
              const productOrders = orderCountByProductId.get(p.id)?.size ?? 0;
              const conversionRate = calcConversionRate(productOrders, viewCount);
              const shippingSetupIncomplete = !hasStoredPackageDetails(p);
              const packageDetails = getEffectivePackageDetails(p);
              return {
                id: p.id,
                title: p.title,
                category: p.category,
                condition: p.condition,
                priceCents: p.priceCents,
                status: p.status,
                inventory: p.inventory,
                viewCount,
                soldQty,
                imageUrl: p.imageUrl ?? null,
                cartAdds,
                isPromoted: !!activePromo,
                promotionLabel: activePromo
                  ? `⭐ Promoted until ${activePromo.expiresAt ? activePromo.expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}`
                  : null,
                conversionRate,
                shippingIncomplete: shippingSetupIncomplete,
                packageSummary: packageDetails
                  ? formatPackageDisplay(packageDetails, shippingSetupIncomplete)
                  : null,
                publishedAt: p.publishedAt?.toISOString() ?? null,
              };
            })}
          />
        )}
      </section>
      )}

      {/* ── Promotions ── */}
      {isPromotionsView && (
      <section id="promotions" className="mb-8">
        <h2 className="text-xl font-bold mb-3">Promotions</h2>

        {/* Free promotion status */}
        <div className={`card p-4 mb-4 text-sm ${freePromotionEligible ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
          {freePromotionEligible && freePromotionExpiresAt ? (
            <span>🎁 <strong>Free promotion active</strong> — expires {freePromotionExpiresAtFormatted} ({freePromotionDaysLeft} day{freePromotionDaysLeft === 1 ? '' : 's'} remaining). Any package you select is free until then.</span>
          ) : freePromotionExpired ? (
            <span>ℹ️ Your <strong>60-day free promotion period has expired</strong> (ended {freePromotionExpiresAtFormatted}). Select a paid package to promote listings.</span>
          ) : (
            <span>ℹ️ No free promotion period configured for your account.</span>
          )}
        </div>

        {/* Active promoted products */}
        {(() => {
          const activePromotedProducts = products.filter(p => p.promotions[0]?.status === 'ACTIVE');
          return activePromotedProducts.length > 0 ? (
            <div className="mb-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Active promoted listings</p>
              <div className="space-y-2">
                {activePromotedProducts.map(p => {
                  const promo = p.promotions[0];
                  return (
                    <div key={p.id} className="card p-3 flex items-center justify-between gap-3 bg-amber-50 border-amber-200">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" title={p.title}>{p.title}</p>
                        <p className="text-xs text-amber-700">
                          ⭐ Sponsored — ends {promo?.expiresAt ? promo.expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </p>
                      </div>
                      <Link href={`/products/${p.id}`} className="btn-outline text-xs py-1 px-2 flex-shrink-0">View</Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null;
        })()}

        {/* Promotion payment history */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Promotion history</p>
          {promotionHistory.length === 0 ? (
            <div className="card p-4 text-slate-500 text-sm">No promotions yet.</div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="px-4 py-3 font-semibold text-slate-600">Listing</th>
                    <th className="px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Package</th>
                    <th className="px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Started</th>
                    <th className="px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Ends / Ended</th>
                    <th className="px-4 py-3 font-semibold text-slate-600 text-right">Amount</th>
                    <th className="px-4 py-3 font-semibold text-slate-600 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {promotionHistory.map(promo => (
                    <tr key={promo.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800 truncate max-w-[140px]" title={promo.product.title}>{promo.product.title}</td>
                      <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                        {getPromotionLabel(promo.durationDays)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                        {promo.startsAt ? promo.startsAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                        {promo.expiresAt ? promo.expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {promo.priceCents === 0 ? <span className="text-green-700">Free</span> : dollars(promo.priceCents)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`badge ${promo.status === 'ACTIVE' ? 'badge-green' : promo.status === 'EXPIRED' ? 'badge-slate' : promo.status === 'CANCELLED' ? 'badge-red' : 'badge-yellow'}`}>
                          {promo.status === 'PENDING_PAYMENT' ? 'PENDING' : promo.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      )}

      {/* ── Recent Orders (for shipping management) ── */}
      {isOrdersView && (
      <section id="orders-to-ship">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-bold">Recent Orders</h2>
          {pendingOrdersToShip > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              {pendingOrdersToShip} {pendingOrdersToShip === 1 ? 'needs' : 'need'} shipping label
            </span>
          )}
        </div>
        {!isRestricted && orders.some(o => !o.isPickup) && (
          <p className="text-sm text-slate-500 mb-3">
            Purchase, print, and track shipping labels directly from each order card below. Labels are available for non-pickup orders in <strong>PAID</strong> status.
          </p>
        )}
        {orders.length === 0 ? (
          <div className="card p-6 text-slate-500">No orders yet.</div>
        ) : (
          <div className="space-y-3">
            {orders.map(o => {
              const orderCarrier = o.carrier ?? o.shippingCarrier;
              return (
                <div key={o.id} className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400 font-mono">{o.id.slice(-8)}</span>
                    <span
                      className={`badge ${
                        o.status === 'REFUNDED'
                          ? 'badge-slate'
                          : o.status === 'PARTIALLY_REFUNDED'
                            ? 'badge-blue'
                            : o.status === 'REFUND_REQUESTED'
                              ? 'badge-yellow'
                              : o.status === 'PAID' || o.status === 'SHIPPED' || o.status === 'DELIVERED'
                                ? 'badge-green'
                                : 'badge-yellow'
                      }`}
                    >
                      {o.status}
                    </span>
                  </div>
                  {o.items.map(i => (
                    <p key={i.id} className="text-sm text-slate-700">{i.product.title} × {i.quantity}</p>
                  ))}
                  <p className="text-sm font-bold mt-2">{dollars(o.items.reduce((s, i) => s + i.lineSubtotalCents + i.shippingCents * i.quantity, 0))}</p>
                  {/* Shipping label fulfillment for non-pickup orders */}
                  {!o.isPickup && !isRestricted && (
                    <SellerShippingLabelForm
                      orderId={o.id}
                      canCreateLabel={o.status === 'PAID'}
                      existingLabelUrl={o.labelUrl}
                      existingTrackingNumber={o.trackingNumber}
                      existingCarrier={orderCarrier}
                      existingService={o.shippingService}
                      existingTrackingUrl={o.trackingUrl ?? buildTrackingUrl(orderCarrier, o.trackingNumber)}
                    />
                  )}
                  {/* Pickup verification for pickup orders — also handles legacy READY_FOR_PICKUP records (normalized to PAID) */}
                  {o.isPickup && normalizeOrderStatus(o.status) === 'PAID' && !isRestricted && (
                    <div className="mt-3">
                      <p className="text-xs text-slate-500 mb-2">📦 Pickup order — verify the buyer&apos;s code at handoff:</p>
                      <PickupVerifyForm orderId={o.id} />
                    </div>
                  )}
                  {o.isPickup && o.status === 'PICKED_UP' && (
                    <p className="text-xs text-green-700 mt-2 font-medium">✅ Pickup confirmed</p>
                  )}
                  {o.trackingNumber && (
                    <p className="text-xs text-slate-500 mt-2">
                      📦 {orderCarrier}: {o.trackingNumber}{o.shippingService ? ` · ${o.shippingService}` : ''}
                    </p>
                  )}
                  {o.shipmentStatus && (
                    <p className="text-xs text-slate-500 mt-1">Shipment status: {o.shipmentStatus}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {isShopByCultureView && (
        <section className="mb-8">
          {(() => {
            const categoryCounts = products.reduce((acc, product) => {
              const key = product.category || 'Uncategorized';
              acc.set(key, (acc.get(key) ?? 0) + 1);
              return acc;
            }, new Map<string, number>());
            const cultureBreakdown = Array.from(categoryCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8);
            return (
              <>
          <h2 className="text-xl font-bold mb-3">Shop by Culture</h2>
          <p className="text-sm text-slate-500 mb-4">
            Manage how your listings appear across culture and community shopping categories.
          </p>
          {cultureBreakdown.length === 0 ? (
            <div className="card p-6 text-slate-500 text-sm">Add listings to start building your culture/category storefront mix.</div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="px-4 py-3 font-semibold text-slate-600">Category</th>
                    <th className="px-4 py-3 font-semibold text-slate-600 text-right">Listings</th>
                  </tr>
                </thead>
                <tbody>
                  {cultureBreakdown.map(([category, count]) => (
                    <tr key={category} className="border-b border-slate-50">
                      <td className="px-4 py-3 text-slate-800">{category}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4">
            <Link href="/seller/my-listings" className="btn-outline text-xs">Manage listing categories</Link>
          </div>
              </>
            );
          })()}
        </section>
      )}
    </main>
  );
  } catch (err: unknown) {
    if (isSchemaNotInitializedError(err)) {
      return (
        <main className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-black">Seller Dashboard</h1>
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
