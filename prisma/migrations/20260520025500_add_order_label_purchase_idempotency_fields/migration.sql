ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "labelPurchaseIdempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "labelProviderTransactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "labelPurchasedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "labelPurchaseLastError" TEXT;
