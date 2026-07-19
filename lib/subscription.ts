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

/**
 * Returns true when seller monthly subscription fees are globally disabled
 * (i.e. the platform is in FREE TIER mode).
 *
 * When the free tier is active, all sellers may list and sell without a paid
 * subscription — only the 7% transaction fee applies.
 * Fees can be re-enabled at any time via the admin panel without data loss.
 */
export function isGlobalFreeTierActive(settings: { sellerSubscriptionFeeEnabled: boolean }): boolean {
  return !settings.sellerSubscriptionFeeEnabled;
}

/**
 * Returns true when a seller is allowed to list and sell.
 * Passes when either their subscription is active OR the global free tier is on.
 */
export function isSellerAllowedToSell(
  user: SubscriptionUser,
  settings: { sellerSubscriptionFeeEnabled: boolean },
): boolean {
  return isGlobalFreeTierActive(settings) || isSubscriptionActive(user);
}
