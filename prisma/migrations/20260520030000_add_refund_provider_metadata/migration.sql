ALTER TABLE "RefundRequest"
  ADD COLUMN IF NOT EXISTS "stripeRefundStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeRefundAmount" INTEGER,
  ADD COLUMN IF NOT EXISTS "stripeRefundCurrency" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeFailureReason" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeErrorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeErrorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeRefundCreatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "stripeRefundUpdatedAt" TIMESTAMP(3);
