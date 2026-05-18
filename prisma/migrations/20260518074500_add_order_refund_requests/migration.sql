-- Add order-level refund workflow for marketplace product orders.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'RefundRequestStatus'
  ) THEN
    CREATE TYPE "RefundRequestStatus" AS ENUM ('REQUESTED', 'SELLER_REVIEW', 'APPROVED', 'DENIED', 'REFUNDED');
  END IF;
END
$$;

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'REFUND_REQUESTED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

CREATE TABLE IF NOT EXISTS "RefundRequest" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "status" "RefundRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "evidenceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requestedAmountCents" INTEGER NOT NULL,
  "approvedAmountCents" INTEGER,
  "adminNotes" TEXT,
  "sellerResponse" TEXT,
  "stripeRefundId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefundRequest_orderId_key" ON "RefundRequest"("orderId");
CREATE INDEX IF NOT EXISTS "RefundRequest_buyerId_createdAt_idx" ON "RefundRequest"("buyerId", "createdAt");
CREATE INDEX IF NOT EXISTS "RefundRequest_sellerId_createdAt_idx" ON "RefundRequest"("sellerId", "createdAt");
CREATE INDEX IF NOT EXISTS "RefundRequest_status_createdAt_idx" ON "RefundRequest"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'RefundRequest_orderId_fkey'
  ) THEN
    ALTER TABLE "RefundRequest"
      ADD CONSTRAINT "RefundRequest_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'RefundRequest_buyerId_fkey'
  ) THEN
    ALTER TABLE "RefundRequest"
      ADD CONSTRAINT "RefundRequest_buyerId_fkey"
      FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'RefundRequest_sellerId_fkey'
  ) THEN
    ALTER TABLE "RefundRequest"
      ADD CONSTRAINT "RefundRequest_sellerId_fkey"
      FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
