import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';

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
    limit: 100,
  });

  const bestSub = [...subs.data].sort((a, b) => {
    const rankA = STRIPE_STATUS_PRIORITY[a.status] ?? 99;
    const rankB = STRIPE_STATUS_PRIORITY[b.status] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return b.created - a.created;
  })[0];

  const subscriptionStatus = bestSub
    ? (STRIPE_SUBSCRIPTION_STATUS_MAP[bestSub.status] ?? 'INACTIVE')
    : 'INACTIVE';
  const subscriptionId = bestSub?.id ?? null;
  const subscriptionCurrentPeriodEnd = getSubscriptionPeriodEnd(bestSub);

  await prisma.user.updateMany({
    where: { id: userId, stripeCustomerId: user.stripeCustomerId },
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
  const value = (subscription as unknown as Record<string, unknown>)['current_period_end'];
  return typeof value === 'number' ? new Date(value * 1000) : null;
}
