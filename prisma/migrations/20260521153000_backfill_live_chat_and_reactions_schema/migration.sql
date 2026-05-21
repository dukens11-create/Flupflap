-- Ensure livestream columns exist on GarageSale
ALTER TABLE "GarageSale"
  ADD COLUMN IF NOT EXISTS "isLive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "liveStartedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "GarageSale_isLive_idx" ON "GarageSale"("isLive");

-- Ensure live chat table exists for buyer/seller messaging
CREATE TABLE IF NOT EXISTS "GarageSaleChat" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "userId" TEXT,
  "guestName" TEXT,
  "message" VARCHAR(500) NOT NULL,
  "isHidden" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GarageSaleChat_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GarageSaleChat"
  ADD COLUMN IF NOT EXISTS "sellerId" TEXT;

CREATE INDEX IF NOT EXISTS "GarageSaleChat_saleId_idx" ON "GarageSaleChat"("saleId");
CREATE INDEX IF NOT EXISTS "GarageSaleChat_saleId_sellerId_idx" ON "GarageSaleChat"("saleId", "sellerId");
CREATE INDEX IF NOT EXISTS "GarageSaleChat_saleId_isHidden_idx" ON "GarageSaleChat"("saleId", "isHidden");
CREATE INDEX IF NOT EXISTS "GarageSaleChat_createdAt_idx" ON "GarageSaleChat"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'GarageSaleChat_saleId_fkey'
  ) THEN
    ALTER TABLE "GarageSaleChat"
      ADD CONSTRAINT "GarageSaleChat_saleId_fkey"
      FOREIGN KEY ("saleId") REFERENCES "GarageSale"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Ensure reactions table exists for live likes/hearts
CREATE TABLE IF NOT EXISTS "GarageSaleReaction" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "userId" TEXT,
  "guestId" TEXT,
  "type" TEXT NOT NULL DEFAULT 'like',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GarageSaleReaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GarageSaleReaction_saleId_createdAt_idx" ON "GarageSaleReaction"("saleId", "createdAt");
CREATE INDEX IF NOT EXISTS "GarageSaleReaction_saleId_type_idx" ON "GarageSaleReaction"("saleId", "type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'GarageSaleReaction_saleId_fkey'
  ) THEN
    ALTER TABLE "GarageSaleReaction"
      ADD CONSTRAINT "GarageSaleReaction_saleId_fkey"
      FOREIGN KEY ("saleId") REFERENCES "GarageSale"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
