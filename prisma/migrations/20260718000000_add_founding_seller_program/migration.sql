-- Add FoundingSellerProgram and SellerSubscription tables for the Founding Seller Program.

CREATE TABLE IF NOT EXISTS "FoundingSellerProgram" (
  "id"                   TEXT NOT NULL,
  "userId"               TEXT NOT NULL,
  "enrollmentDate"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiryDate"           TIMESTAMP(3) NOT NULL,
  "foundingSellerNumber" INTEGER NOT NULL,
  "status"               TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FoundingSellerProgram_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FoundingSellerProgram_userId_key"               ON "FoundingSellerProgram"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "FoundingSellerProgram_foundingSellerNumber_key" ON "FoundingSellerProgram"("foundingSellerNumber");
CREATE INDEX        IF NOT EXISTS "FoundingSellerProgram_userId_idx"               ON "FoundingSellerProgram"("userId");
CREATE INDEX        IF NOT EXISTS "FoundingSellerProgram_status_idx"               ON "FoundingSellerProgram"("status");
CREATE INDEX        IF NOT EXISTS "FoundingSellerProgram_foundingSellerNumber_idx" ON "FoundingSellerProgram"("foundingSellerNumber");

CREATE TABLE IF NOT EXISTS "SellerSubscription" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'ACTIVE',
  "monthlyFeeCents" INTEGER NOT NULL DEFAULT 0,
  "nextBillingDate" TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SellerSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SellerSubscription_userId_key"  ON "SellerSubscription"("userId");
CREATE INDEX        IF NOT EXISTS "SellerSubscription_userId_idx"  ON "SellerSubscription"("userId");
CREATE INDEX        IF NOT EXISTS "SellerSubscription_status_idx"  ON "SellerSubscription"("status");
CREATE INDEX        IF NOT EXISTS "SellerSubscription_type_idx"    ON "SellerSubscription"("type");
