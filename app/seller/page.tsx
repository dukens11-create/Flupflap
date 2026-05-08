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
import {
  getDefaultSellerKycProvider,
  isSellerVerificationApproved,
  sellerKycProviderLabel,
  sellerPhoneVerificationLabel,
  sellerVerificationStatusTone,
} from '@/lib/seller-verification';

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

export default async function SellerPage({ searchParams }: { searchParams: Promise<{ created?: string; stripe?: string; reason?: string; updated?: string; deleted?: string; promoted?: string; subscribed?: string; subscribe?: string; verification?: string }> }) {
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
  const defaultKycProvider = getDefaultSellerKycProvider();

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
  const verificationApproved = isSellerVerificationApproved(verificationSubmission);
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
        {!isRestricted && subscriptionActive && verificationApproved && <Link href="/seller/new" className="btn-primary">+ New listing</Link>}
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

      {sp.verification === 'submitted' && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Seller verification submitted. An admin will review your documents before you can list products.
        </div>
      )}
      {sp.verification === 'provider_started' && (
        <div className="card p-4 mb-6 bg-blue-50 border-blue-200 text-blue-900 text-sm">
          ✅ Provider verification has been started. Complete all provider steps, then return to this dashboard to track status updates.
        </div>
      )}
      {sp.verification === 'provider_pending' && (
        <div className="card p-4 mb-6 bg-amber-50 border-amber-300 text-amber-900 text-sm">
          Verification is in progress with your selected provider. Listings remain locked until all checks are approved.
        </div>
      )}
      {sp.verification === 'manual_required' && (
        <div className="card p-4 mb-6 bg-slate-50 border-slate-200 text-slate-700 text-sm">
          Manual verification mode is enabled. Submit documents below for admin review.
        </div>
      )}

      {sp.verification === 'required' && (
        <div className="card p-4 mb-6 bg-amber-50 border-amber-300 text-amber-900 text-sm">
          Submit and pass seller verification before creating product listings.
        </div>
      )}

      {!isRestricted && (
        <section className="card p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Seller verification
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`badge ${sellerVerificationStatusTone(verificationSubmission?.status)}`}>
                  {verificationSubmission?.status ?? 'Not submitted'}
                </span>
                <span className="text-xs text-slate-500">
                  Provider: {sellerKycProviderLabel(verificationSubmission?.provider ?? defaultKycProvider)}
                </span>
                {verificationSubmission?.phoneVerificationStatus && (
                  <span className="text-xs text-slate-500">
                    Phone verification: {sellerPhoneVerificationLabel(verificationSubmission.phoneVerificationStatus)}
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-slate-600 max-w-2xl">
                Upload your government ID (front and back), a selfie / face verification photo, your physical address, and your phone number. Listings stay locked until an admin approves your seller verification.
              </p>
              {verificationSubmission?.status === 'REJECTED' && verificationSubmission.rejectionReason && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <span className="font-semibold">Rejected by a FlupFlap admin:</span> {verificationSubmission.rejectionReason}
                </p>
              )}
              {verificationSubmission?.status === 'APPROVED' && (
                <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  Your seller verification is approved. You can now create listings once your subscription is active.
                </p>
              )}
              {verificationSubmission?.status === 'PENDING' && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Your verification is pending review. We&apos;ll notify you here once a FlupFlap admin approves or rejects it.
                </p>
              )}
              <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                <p className={`rounded-lg border px-2 py-1 ${verificationSubmission?.governmentIdVerified ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white'}`}>Government ID: {verificationSubmission?.governmentIdVerified ? 'Verified' : 'Pending'}</p>
                <p className={`rounded-lg border px-2 py-1 ${verificationSubmission?.selfieVerified ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white'}`}>Selfie / face: {verificationSubmission?.selfieVerified ? 'Verified' : 'Pending'}</p>
                <p className={`rounded-lg border px-2 py-1 ${verificationSubmission?.addressVerified ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white'}`}>Address: {verificationSubmission?.addressVerified ? 'Verified' : 'Pending'}</p>
                <p className={`rounded-lg border px-2 py-1 ${verificationSubmission?.phoneVerified ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white'}`}>Phone: {verificationSubmission?.phoneVerified ? 'Verified' : 'Pending'}</p>
              </div>
            </div>
            {verificationSubmission && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-800">{verificationSubmission.phoneNumber}</p>
                <p>
                  {verificationSubmission.street}
                  <br />
                  {verificationSubmission.city}, {verificationSubmission.state} {verificationSubmission.zipCode}
                  <br />
                  {verificationSubmission.country}
                </p>
              </div>
            )}
          </div>

          {!verificationApproved && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Start provider verification</p>
              <p className="mt-1 text-xs text-slate-600">
                Use Stripe Identity + Connect (default) or Persona. If provider checks are incomplete, admins can finalize with manual fallback review.
              </p>
              <form action="/api/seller/verification/initiate" method="POST" className="mt-3 flex flex-wrap items-center gap-3">
                <select name="provider" className="input text-sm max-w-[220px]" defaultValue={verificationSubmission?.provider ?? defaultKycProvider}>
                  <option value="STRIPE">Stripe Identity + Connect</option>
                  <option value="PERSONA">Persona</option>
                </select>
                <button className="btn-outline text-sm" type="submit">
                  Start provider KYC
                </button>
                {defaultKycProvider === 'STRIPE' && (
                  <a href="/api/stripe/connect" className="text-xs text-blue-700 hover:underline">
                    Open Stripe Connect onboarding
                  </a>
                )}
              </form>
            </div>
          )}

          {!verificationApproved && (
            <form
              action="/api/seller/verification"
              method="POST"
              encType="multipart/form-data"
              className="mt-6 space-y-4 border-t border-slate-100 pt-6"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Phone number</label>
                  <input
                    name="phoneNumber"
                    type="tel"
                    className="input"
                    required
                    defaultValue={verificationSubmission?.phoneNumber ?? dbUser?.phone ?? ''}
                    placeholder="+1 555 000 1234"
                  />
                </div>
                <div>
                  <label className="label">Country</label>
                  <input
                    name="country"
                    className="input"
                    required
                    defaultValue={verificationSubmission?.country ?? 'US'}
                    placeholder="United States"
                  />
                </div>
              </div>

              <div>
                <label className="label">Street address</label>
                <input
                  name="street"
                  className="input"
                  required
                  defaultValue={verificationSubmission?.street ?? ''}
                  placeholder="123 Main Street"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="label">City</label>
                  <input
                    name="city"
                    className="input"
                    required
                    defaultValue={verificationSubmission?.city ?? ''}
                    placeholder="Dallas"
                  />
                </div>
                <div>
                  <label className="label">State / Province</label>
                  <input
                    name="state"
                    className="input"
                    required
                    defaultValue={verificationSubmission?.state ?? ''}
                    placeholder="TX"
                  />
                </div>
                <div>
                  <label className="label">ZIP / Postal code</label>
                  <input
                    name="zipCode"
                    className="input"
                    required
                    defaultValue={verificationSubmission?.zipCode ?? ''}
                    placeholder="75001"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="label">Government ID front</label>
                  <input
                    name="governmentIdFront"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="input py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-medium cursor-pointer"
                    required={!verificationSubmission}
                  />
                </div>
                <div>
                  <label className="label">Government ID back</label>
                  <input
                    name="governmentIdBack"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="input py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-medium cursor-pointer"
                    required={!verificationSubmission}
                  />
                </div>
                <div>
                  <label className="label">Selfie / face verification</label>
                  <input
                    name="selfieImage"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="input py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-medium cursor-pointer"
                    required={!verificationSubmission}
                  />
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Verification documents are stored privately and are only available to you and FlupFlap admins during review.
              </p>

              <button className="btn-primary" type="submit">
                {verificationSubmission?.status === 'REJECTED' ? 'Resubmit verification' : verificationSubmission ? 'Update verification' : 'Submit verification'}
              </button>
            </form>
          )}
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

      {subscribedFromCheckout && subscriptionActive && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          🎉 Subscription activated! You can now list and sell items on FlupFlap.
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
        {stripeAccountId && stripeChargesEnabled !== null && stripePayoutsEnabled !== null && (
          <p className="text-xs text-slate-500 mt-2">
            Stripe status: charges {stripeChargesEnabled ? 'enabled' : 'disabled'} · payouts {stripePayoutsEnabled ? 'enabled' : 'disabled'}
            {stripeDisabledReason ? ` · ${stripeDisabledReason.replaceAll('_', ' ')}` : ''}
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
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3">My Listings</h2>
        {products.length === 0 ? (
          <div className="card p-6 text-slate-500">
            {emptyListingsMessage}
          </div>
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
