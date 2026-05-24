-- Add the SellerRefundHistory table for tracking refund and compensation credit records.
-- This table was added to prisma/schema.prisma without a corresponding migration;
-- this migration ensures it exists in all environments (including production on Render).

CREATE TABLE IF NOT EXISTS "SellerRefundHistory" (
  "id"                    TEXT NOT NULL,
  "sellerId"              TEXT NOT NULL,
  "orderId"               TEXT,
  "saleId"                TEXT,
  "refundType"            TEXT NOT NULL,
  "sourceLabel"           TEXT,
  "sourceKey"             TEXT NOT NULL,
  "stripePaymentIntentId" TEXT,
  "stripeRefundId"        TEXT,
  "amountCents"           INTEGER,
  "currency"              TEXT,
  "status"                TEXT NOT NULL,
  "reason"                TEXT,
  "refundedAt"            TIMESTAMP(3),
  "resolvedAt"            TIMESTAMP(3),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SellerRefundHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SellerRefundHistory_sourceKey_key" ON "SellerRefundHistory"("sourceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "SellerRefundHistory_stripeRefundId_key" ON "SellerRefundHistory"("stripeRefundId");
CREATE INDEX IF NOT EXISTS "SellerRefundHistory_sellerId_createdAt_idx" ON "SellerRefundHistory"("sellerId", "createdAt");
CREATE INDEX IF NOT EXISTS "SellerRefundHistory_orderId_idx" ON "SellerRefundHistory"("orderId");
CREATE INDEX IF NOT EXISTS "SellerRefundHistory_saleId_idx" ON "SellerRefundHistory"("saleId");
CREATE INDEX IF NOT EXISTS "SellerRefundHistory_stripePaymentIntentId_idx" ON "SellerRefundHistory"("stripePaymentIntentId");
