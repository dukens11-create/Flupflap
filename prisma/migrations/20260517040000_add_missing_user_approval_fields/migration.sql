-- Add all User columns required by the admin approval, moderation, phone
-- verification, and seller-dashboard flows that were added to schema.prisma
-- without a corresponding committed migration.
--
-- ADD COLUMN IF NOT EXISTS is used throughout so this migration is idempotent
-- on databases where some columns already exist (e.g. from a prior db push or
-- partial manual migration).

ALTER TABLE "User"
  -- KYC / approval tracking fields (written by admin verification approval route)
  ADD COLUMN IF NOT EXISTS "kycStatus"                    "KycStatus"     NOT NULL DEFAULT 'NOT_SUBMITTED',
  ADD COLUMN IF NOT EXISTS "verifiedSeller"               BOOLEAN         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "approvedAt"                   TIMESTAMP(3),

  -- Seller account moderation fields (written by admin moderation route)
  ADD COLUMN IF NOT EXISTS "sellerStatusReason"           TEXT,
  ADD COLUMN IF NOT EXISTS "sellerStatusNotes"            TEXT,

  -- Phone verification timestamp
  ADD COLUMN IF NOT EXISTS "phoneVerifiedAt"              TIMESTAMP(3),

  -- Account soft-deletion context
  ADD COLUMN IF NOT EXISTS "deletionReason"               TEXT,
  ADD COLUMN IF NOT EXISTS "deletionReasonOther"          TEXT,

  -- Stripe Connect mode tracking (to detect test-vs-live account mismatches)
  ADD COLUMN IF NOT EXISTS "stripeAccountMode"            TEXT,

  -- Auth.js / NextAuth profile picture column
  ADD COLUMN IF NOT EXISTS "image"                        TEXT,

  -- Seller plan foreign key (nullable; FK constraint is optional for Prisma queries)
  ADD COLUMN IF NOT EXISTS "sellerPlanId"                 TEXT,

  -- Seller public shop profile
  ADD COLUMN IF NOT EXISTS "shopName"                     TEXT,
  ADD COLUMN IF NOT EXISTS "shopLogoUrl"                  TEXT,
  ADD COLUMN IF NOT EXISTS "shopDescription"              TEXT,

  -- Seller ship-from address for live shipping rate calculation
  ADD COLUMN IF NOT EXISTS "shipFromName"                 TEXT,
  ADD COLUMN IF NOT EXISTS "shipFromStreet"               TEXT,
  ADD COLUMN IF NOT EXISTS "shipFromCity"                 TEXT,
  ADD COLUMN IF NOT EXISTS "shipFromState"                TEXT,
  ADD COLUMN IF NOT EXISTS "shipFromZip"                  TEXT,
  ADD COLUMN IF NOT EXISTS "shipFromCountry"              TEXT,
  ADD COLUMN IF NOT EXISTS "shipFromPhone"                TEXT,

  -- Seller subscription billing
  ADD COLUMN IF NOT EXISTS "stripeCustomerId"             TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionId"               TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionStatus"           TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionCurrentPeriodEnd" TIMESTAMP(3),

  -- Free promotion window (canonical)
  ADD COLUMN IF NOT EXISTS "freePromotionStart"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "freePromotionEnd"             TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "hasFreePromotion"             BOOLEAN         NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "promotionCredits"             INTEGER         NOT NULL DEFAULT 0,

  -- Legacy free-promotion aliases (kept for backward compatibility)
  ADD COLUMN IF NOT EXISTS "freePromotionGrantedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "freePromotionExpiresAt"       TIMESTAMP(3);
