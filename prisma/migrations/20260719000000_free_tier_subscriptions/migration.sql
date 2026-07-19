-- Migration: Free Tier Subscriptions
-- Adds sellerSubscriptionFeeEnabled toggle to MarketplaceSettings (default false = fees disabled).
-- Resets all existing SellerSubscription records to $0/month with no billing date,
-- preserving type and userId for future re-activation.

-- Add the global free-tier toggle (default false = fees are DISABLED / free tier is ON)
ALTER TABLE "MarketplaceSettings" ADD COLUMN "sellerSubscriptionFeeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Zero out all existing seller subscriptions: no fee, no billing date.
-- type and userId are preserved for future re-activation.
UPDATE "SellerSubscription"
SET "monthlyFeeCents" = 0,
    "nextBillingDate" = NULL,
    "updatedAt"       = NOW();
