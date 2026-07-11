-- Add Founding Seller Program schema

-- Create enum for seller subscription types
CREATE TYPE "SellerSubscriptionType" AS ENUM ('FOUNDING', 'GARAGE_SELLER', 'REGULAR_SELLER', 'PREMIUM');

-- Create enum for subscription status
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING_RENEWAL');

-- Create FoundingSellerProgram table
CREATE TABLE "FoundingSellerProgram" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "enrollmentDate" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiryDate" TIMESTAMP NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "foundingSellerNumber" INTEGER NOT NULL UNIQUE, -- Tracks order of enrollment (e.g., #42 out of 1,000)
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundingSellerProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Create SellerSubscription table (extends existing User subscription tracking)
CREATE TABLE "SellerSubscription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "type" "SellerSubscriptionType" NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "monthlyFee" DECIMAL(10, 2),
  "nextBillingDate" TIMESTAMP,
  "cancelledAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Add seller subscription columns to User table if not exists
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerSubscriptionId" TEXT REFERENCES "SellerSubscription"("id");

-- Create index for founding seller lookup
CREATE INDEX "FoundingSellerProgram_userId_idx" ON "FoundingSellerProgram"("userId");
CREATE INDEX "FoundingSellerProgram_status_idx" ON "FoundingSellerProgram"("status");
CREATE INDEX "SellerSubscription_userId_idx" ON "SellerSubscription"("userId");
CREATE INDEX "SellerSubscription_type_idx" ON "SellerSubscription"("type");
