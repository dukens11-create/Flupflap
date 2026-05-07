import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';

// Stripe list API max is 100. Sellers typically have one active subscription,
// but we allow enough history for cancellations/reactivations during recovery.
const SUBSCRIPTION_SYNC_LIST_LIMIT = 100;

const STRIPE_SUBSCRIPTION_STATUS_MAP: Record<string, string> = {
  active: 'ACTIVE',
  trialing: 'ACTIVE',
  past_due: 'PAST_DUE',
  unpaid: 'PAST_DUE',
  canceled: 'CANCELLED',
  incomplete: 'INACTIVE',
  incomplete_expired: 'INACTIVE',
  paused: 'INACTIVE',
};

const STRIPE_STATUS_PRIORITY: Record<string, number> = {
  active: 0,
  trialing: 0,
  past_due: 1,
  unpaid: 1,
  incomplete: 2,
  incomplete_expired: 2,
  paused: 3,
  canceled: 4,
};

type SyncedSubscriptionState = {
  subscriptionStatus: string | null;
  subscriptionId: string | null;
  subscriptionCurrentPeriodEnd: Date | null;
};

/**
 * Recovers seller subscription state from Stripe if local DB status is stale.
 * Uses the signed-in seller's stored Stripe customer as source of truth.
 *
 * @param userId Seller user id from the authenticated server session.
 * @returns Updated subscription fields, or null when the user no longer exists.
 */
export async function syncSellerSubscriptionFromStripe(userId: string): Promise<SyncedSubscriptionState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      stripeCustomerId: true,
      subscriptionStatus: true,
      subscriptionId: true,
      subscriptionCurrentPeriodEnd: true,
    },
  });

  if (!user) return null;
  if (!user.stripeCustomerId) {
    return {
      subscriptionStatus: user.subscriptionStatus ?? null,
      subscriptionId: user.subscriptionId ?? null,
      subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd ?? null,
    };
  }

  const subs = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    status: 'all',
    limit: SUBSCRIPTION_SYNC_LIST_LIMIT,
  });

  if (subs.data.length === 0) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'INACTIVE',
        subscriptionId: null,
        subscriptionCurrentPeriodEnd: null,
      },
    });
    return {
      subscriptionStatus: 'INACTIVE',
      subscriptionId: null,
      subscriptionCurrentPeriodEnd: null,
    };
  }

  const bestSub = [...subs.data].sort((a, b) => {
    const rankA = STRIPE_STATUS_PRIORITY[a.status] ?? 99;
    const rankB = STRIPE_STATUS_PRIORITY[b.status] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return b.created - a.created;
  })[0];

  const subscriptionStatus = STRIPE_SUBSCRIPTION_STATUS_MAP[bestSub.status] ?? 'INACTIVE';
  const subscriptionId = bestSub.id;
  const subscriptionCurrentPeriodEnd = getSubscriptionPeriodEnd(bestSub);

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus,
      subscriptionId,
      subscriptionCurrentPeriodEnd,
    },
  });

  return { subscriptionStatus, subscriptionId, subscriptionCurrentPeriodEnd };
}

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription | undefined): Date | null {
  if (!subscription) return null;
  if (!('current_period_end' in subscription)) return null;
  const value = subscription.current_period_end;
  return typeof value === 'number' ? new Date(value * 1000) : null;
}
