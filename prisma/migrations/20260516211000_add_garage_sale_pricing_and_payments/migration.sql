-- CreateEnum
CREATE TYPE "GarageSaleListingType" AS ENUM ('STANDARD', 'FEATURED');

-- CreateEnum
CREATE TYPE "GarageSalePaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- AlterTable
ALTER TABLE "MarketplaceSettings"
ADD COLUMN "garageStandardPriceCents" INTEGER NOT NULL DEFAULT 299,
ADD COLUMN "garageFeaturedPriceCents" INTEGER NOT NULL DEFAULT 699,
ADD COLUMN "garageHomepagePromoEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "garageHomepagePromoCents" INTEGER NOT NULL DEFAULT 499,
ADD COLUMN "garageTopSearchEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "garageTopSearchCents" INTEGER NOT NULL DEFAULT 399,
ADD COLUMN "garageFirstListingFree" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GarageSale"
ADD COLUMN "listingType" "GarageSaleListingType" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "expirationTimestamp" TIMESTAMP(3),
ADD COLUMN "durationDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "homepagePromoted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "topSearchPromoted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pricePerDayCents" INTEGER NOT NULL DEFAULT 299,
ADD COLUMN "baseAmountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "addOnsAmountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalPaidCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "paymentStatus" "GarageSalePaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "stripeCheckoutId" TEXT,
ADD COLUMN "stripePaymentId" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "activatedAt" TIMESTAMP(3),
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "repostOfId" TEXT;

-- Backfill expiration timestamp from endDate
UPDATE "GarageSale"
SET "expirationTimestamp" = "endDate"
WHERE "expirationTimestamp" IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE "GarageSale"
ALTER COLUMN "expirationTimestamp" SET NOT NULL;

-- CreateTable
CREATE TABLE "GarageSalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "GarageSalePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripeCheckoutId" TEXT,
    "stripePaymentId" TEXT,
    "stripeReceiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GarageSalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GarageSale_stripeCheckoutId_key" ON "GarageSale"("stripeCheckoutId");

-- CreateIndex
CREATE INDEX "GarageSale_paymentStatus_idx" ON "GarageSale"("paymentStatus");

-- CreateIndex
CREATE INDEX "GarageSale_expirationTimestamp_idx" ON "GarageSale"("expirationTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "GarageSalePayment_stripeCheckoutId_key" ON "GarageSalePayment"("stripeCheckoutId");

-- CreateIndex
CREATE INDEX "GarageSalePayment_saleId_idx" ON "GarageSalePayment"("saleId");

-- CreateIndex
CREATE INDEX "GarageSalePayment_sellerId_idx" ON "GarageSalePayment"("sellerId");

-- CreateIndex
CREATE INDEX "GarageSalePayment_status_idx" ON "GarageSalePayment"("status");

-- AddForeignKey
ALTER TABLE "GarageSale" ADD CONSTRAINT "GarageSale_repostOfId_fkey" FOREIGN KEY ("repostOfId") REFERENCES "GarageSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarageSalePayment" ADD CONSTRAINT "GarageSalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "GarageSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarageSalePayment" ADD CONSTRAINT "GarageSalePayment_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
