/** Seller subscription constants and helpers. */

/** Monthly price in cents — $4.99/month */
export const SELLER_SUBSCRIPTION_PRICE_CENTS = 499;

/** Human-readable price label */
export const SELLER_SUBSCRIPTION_PRICE_LABEL = '$4.99/month';

export type SubscriptionStatus = 'ACTIVE' | 'INACTIVE' | 'PAST_DUE' | 'CANCELLED';

type SubscriptionUser = {
  subscriptionStatus?: string | null;
};

/**
 * Returns true when the seller has an active subscription that permits
 * listing and selling on FlupFlap.
 */
export function isSubscriptionActive(user: SubscriptionUser): boolean {
  return user.subscriptionStatus === 'ACTIVE';
}
