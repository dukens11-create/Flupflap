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
import { expirePromotions } from '@/lib/promotions';
import { isSubscriptionActive, SELLER_SUBSCRIPTION_PRICE_LABEL } from '@/lib/subscription';
import { syncSellerSubscriptionFromStripe } from '@/lib/subscription-sync';
import SubscriptionButton from '@/components/SubscriptionButton';
import { getInboxConversations, getSellerResponseStats, SELLER_RESPONSE_WINDOW_HOURS } from '@/lib/messages';
import { getFreePromotionWindowLabel, isFreePromotionEligible } from '@/lib/free-promotion';
import {
  isSellerVerificationApproved,
  sellerVerificationStatusTone,
} from '@/lib/seller-verification';
import { buildTrackingUrl } from '@/lib/shipping';
import SellerShippingLabelForm from '@/components/SellerShippingLabelForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Seller Dashboard' };

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

function orderStatusBadge(status: string) {
  const greenStatuses = ['PAID', 'SHIPPED', 'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP'];
  return greenStatuses.includes(status) ? 'badge-green' : 'badge-yellow';
}

function sellerVerificationStatusLabel(status?: string | null) {
  if (status === 'APPROVED') return 'verified';
  if (status === 'REJECTED') return 'rejected';
  return 'pending';
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

export default async function SellerPage({ searchParams }: { searchParams: Promise<{ created?: string; stripe?: string; reason?: string; updated?: string; deleted?: string; promoted?: string; subscribed?: string; subscribe?: string; verification?: string; fraud?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');
  const sp = await searchParams;
  const subscribedFromCheckout = sp.subscribed === '1';

  // Fetch full user to check seller status (session JWT may be stale)
  let dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
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
  const isRestricted = sellerStatus === 'SUSPENDED' || sellerStatus === 'BANNED';
  const subscriptionActive = dbUser ? isSubscriptionActive(dbUser) : false;
  const subscriptionPeriodEnd = dbUser?.subscriptionCurrentPeriodEnd ?? null;
  const subscriptionStatus = dbUser?.subscriptionStatus ?? null;
  const freePromotionEligible = dbUser ? isFreePromotionEligible(dbUser) : false;
  const freePromotionExpiresAt = dbUser?.freePromotionExpiresAt ?? null;
  await expirePromotions();
  const [settings, products, orders, soldItems, verificationSubmission] = await Promise.all([
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
        cartInterest: {
          select: {
            totalAdds: true,
            lastAddedAt: true,
          },
        },
      },
    }),
    prisma.order.findMany({
      where: { items: { some: { product: { sellerId: session.user.id } } } },
      include: {
        items: {
          where: { product: { sellerId: session.user.id } },
          include: { product: { select: { title: true } } },
        },
      },
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
    prisma.sellerVerification.findUnique({
      where: { sellerId: session.user.id },
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
        eligibleToListAt: true,
        adminFallbackStatus: true,
        adminFallbackReason: true,
      },
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
  const activeListingsCount = products.filter(p => p.status === 'APPROVED').length;
  const totalCartAdds = products.reduce((sum, product) => sum + (product.cartInterest?.totalAdds ?? 0), 0);
  const soldItemsThisWeek = soldItems.filter(i => i.order.createdAt >= weekStart);
  const soldItemsThisMonth = soldItems.filter(i => i.order.createdAt >= monthStart);
  const soldCountThisWeek = soldItemsThisWeek.reduce((s, i) => s + i.quantity, 0);
  const soldCountThisMonth = soldItemsThisMonth.reduce((s, i) => s + i.quantity, 0);
  const revenueThisWeekCents = soldItemsThisWeek.reduce((s, i) => s + i.sellerNetCents, 0);
  const revenueThisMonthCents = soldItemsThisMonth.reduce((s, i) => s + i.sellerNetCents, 0);
  const pendingOrdersToShip = orders.filter((order) => order.status === 'PAID').length;
  const verificationApproved = isSellerVerificationApproved(verificationSubmission);
  const inboxConversations = await getInboxConversations(session.user.id);
  const unreadInboxCount = inboxConversations.reduce(
    (sum, conversation) => sum + conversation.unreadCount,
    0,
  );
  const sellerResponseStats = await getSellerResponseStats(session.user.id);
  let emptyListingsMessage: ReactNode = 'No listings yet. Subscribe to start selling.';
  if (subscriptionActive && verificationApproved) {
    emptyListingsMessage = (
      <span>
        No listings yet. <Link href="/seller/new" className="text-blue-600 hover:underline">Create one</Link>.
      </span>
    );
  } else if (subscriptionActive) {
    emptyListingsMessage = 'No listings yet. Complete seller verification to start selling.';
  }

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
        where: { id: session.user.id },
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
          <h1 className="text-3xl font-black">Seller Dashboard</h1>
          <p className="text-slate-500 text-sm">Welcome back, {session.user.name}</p>
        </div>
        {!isRestricted && subscriptionActive && verificationApproved && <Link href="/seller/new" className="btn-primary">Add New Product</Link>}
      </div>

      <section id="sales-overview" className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-5">
        <StatCard label="Total Sales" value={dollars(grossSalesCents)} />
        <StatCard label="Active Listings" value={String(activeListingsCount)} />
        <StatCard label="Pending Orders" value={String(pendingOrdersToShip)} sub="orders to ship" />
        <div id="promotion-status" className="card p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Promotion Status</p>
          <p className="mt-2 text-sm font-semibold text-indigo-700">
            {freePromotionEligible ? '2 months free promotion active' : 'No free promotion active'}
          </p>
        </div>
        <div id="verification-status-summary" className="card p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Verification Status</p>
          <p className="mt-2 text-sm font-semibold text-slate-700">{sellerVerificationStatusLabel(verificationSubmission?.status)}</p>
        </div>
      </section>

      {isRestricted && (
        <div className="card p-5 mb-6 bg-red-50 border-red-200 text-red-800">
          <p className="font-semibold mb-1">Your seller account has been restricted.</p>
          <p className="text-sm">
            Your account is currently under review and certain seller features are
            unavailable. If you believe this is an error, please contact support.
          </p>
        </div>
      )}

      {sp.verification === 'submitted' && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Seller verification submitted. You&apos;ll be automatically approved once required checks pass. Admin review is only used as fallback when checks are incomplete or fail.
        </div>
      )}
      {sp.verification === 'provider_started' && (
        <div className="card p-4 mb-6 bg-blue-50 border-blue-200 text-blue-900 text-sm">
          ✅ Provider verification has been started. Complete all provider steps, then return to this dashboard to track status updates.
        </div>
      )}
      {sp.verification === 'provider_pending' && (
        <div className="card p-4 mb-6 bg-amber-50 border-amber-300 text-amber-900 text-sm">
          Identity verification is in progress. Listings remain locked until your identity is verified.
        </div>
      )}

      {sp.verification === 'required' && (
        <div className="card p-4 mb-6 bg-amber-50 border-amber-300 text-amber-900 text-sm">
          Submit and pass seller verification before creating product listings.
        </div>
      )}
      {sp.fraud === 'review' && (
        <div className="card p-4 mb-6 bg-amber-50 border-amber-300 text-amber-900 text-sm">
          Your latest listing triggered extra trust-and-safety review signals (for example duplicate content, unusual pricing, or rapid posting). An admin will review it before it goes live.
        </div>
      )}

      {!isRestricted && (
        <section id="verification-status" className="card p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-slate-900">Seller Identity Verification</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`badge ${sellerVerificationStatusTone(verificationSubmission?.status)}`}>
                  {sellerVerificationStatusLabel(verificationSubmission?.status)}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600 max-w-2xl">
                To sell on FlupFlap, verify your identity with a government ID and selfie.
              </p>
              {verificationSubmission?.status === 'REJECTED' && verificationSubmission.rejectionReason && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <span className="font-semibold">Verification was rejected:</span> {verificationSubmission.rejectionReason}
                </p>
              )}
              {verificationSubmission?.status === 'APPROVED' && (
                <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  Your seller verification is approved. You can now create listings once your subscription is active.
                </p>
              )}
              {verificationSubmission?.status === 'PENDING' && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Your verification is pending while Stripe Identity checks finish syncing.
                </p>
              )}
              {!verificationApproved && (
                <form action="/api/seller/verification/initiate" method="POST" className="mt-6">
                  <button className="btn-primary" type="submit">
                    Verify Identity
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Seller Subscription ── */}
      {!isRestricted && !subscriptionActive && (
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

      {!isRestricted && subscriptionActive && (
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
      {subscribedFromCheckout && freePromotionEligible && freePromotionExpiresAt && (
        <div className="card p-4 mb-6 bg-blue-50 border-blue-200 text-blue-900 text-sm">
          🎁 New seller benefit unlocked: free promotions for {getFreePromotionWindowLabel()} (until {freePromotionExpiresAt.toLocaleDateString('en-US', DEFAULT_DATE_FORMAT_OPTIONS)}).
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
          <a href="/api/stripe/connect" className="btn-outline text-xs flex-shrink-0">Connect bank account</a>
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
          <a href="/api/stripe/connect" className="btn-outline text-xs flex-shrink-0">Resume setup</a>
        </div>
      )}

      {/* ── Earnings Summary ── */}
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
          <p className="text-xs text-slate-400">
            Stripe balance reflects your connected account. <a href="/api/stripe/connect" className="text-blue-500 hover:underline">Open Stripe dashboard →</a>
          </p>
        )}
        {stripeAccountId && stripeChargesEnabled !== null && stripePayoutsEnabled !== null && (
          <p className="text-xs text-slate-500 mt-2">
            Stripe status: charges {stripeChargesEnabled ? 'enabled' : 'disabled'} · payouts {stripePayoutsEnabled ? 'enabled' : 'disabled'}
            {stripeDisabledReason ? ` · ${stripeDisabledReason.replaceAll('_', ' ')}` : ''}
          </p>
        )}
      </section>

      {/* ── Product Statistics ── */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3">Product Statistics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Listed This Week" value={String(productsAddedThisWeek)} sub="new products since Monday" />
          <StatCard label="Listed This Month" value={String(productsAddedThisMonth)} sub="new products this month" />
          <StatCard label="Active Listings" value={String(activeListingsCount)} sub="currently approved & live" />
          <StatCard label="Cart Adds" value={String(totalCartAdds)} sub="buyers adding your items to cart" />
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

      {/* ── My Listings ── */}
      <section id="my-listings" className="mb-8">
        <h2 className="text-xl font-bold mb-3">My Listings</h2>
        {products.length === 0 ? (
          <div className="card p-6 text-slate-500">
            {emptyListingsMessage}
          </div>
        ) : (
          <div className="space-y-3">
            {products.map(p => {
              const activePromo = p.promotions[0] ?? null;
              const cartAdds = p.cartInterest?.totalAdds ?? 0;
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
                    <p className="text-xs text-slate-500">
                      Cart interest: <span className="font-semibold text-slate-700">{cartAdds}</span>{cartAdds === 1 ? ' add' : ' adds'}
                      {p.cartInterest?.lastAddedAt
                        ? ` · last activity ${p.cartInterest.lastAddedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : ''}
                    </p>
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
      <section id="orders-to-ship">
        <h2 className="text-xl font-bold mb-3">Recent Orders</h2>
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
                    <span className={`badge ${o.status === 'PAID' || o.status === 'SHIPPED' || o.status === 'DELIVERED' ? 'badge-green' : 'badge-yellow'}`}>{o.status}</span>
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
                      existingTrackingUrl={buildTrackingUrl(orderCarrier, o.trackingNumber)}
                    />
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
                    <p className="text-xs text-slate-500 mt-2">📦 {orderCarrier}: {o.trackingNumber}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
