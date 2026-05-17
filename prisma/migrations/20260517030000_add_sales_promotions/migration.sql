-- CreateEnum
CREATE TYPE "SalesPromotionKind" AS ENUM ('DISCOUNT', 'OFFER');

-- CreateEnum
CREATE TYPE "SalesPromotionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SellerDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "SellerPromotionTriggerType" AS ENUM ('ANY_PURCHASE', 'MIN_SPEND', 'MIN_QUANTITY');

-- CreateEnum
CREATE TYPE "SellerPromotionRewardType" AS ENUM ('FREE_ITEM');

-- CreateTable
CREATE TABLE "SalesPromotion" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "kind" "SalesPromotionKind" NOT NULL,
    "status" "SalesPromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "SellerDiscountType",
    "discountValue" INTEGER,
    "triggerType" "SellerPromotionTriggerType",
    "triggerValue" INTEGER,
    "rewardType" "SellerPromotionRewardType",
    "rewardProductId" TEXT,
    "rewardQuantity" INTEGER NOT NULL DEFAULT 1,
    "applicableProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalUsageLimit" INTEGER,
    "perCustomerLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "conversionCount" INTEGER NOT NULL DEFAULT 0,
    "revenueImpactCents" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesPromotion_sellerId_kind_status_idx" ON "SalesPromotion"("sellerId", "kind", "status");

-- CreateIndex
CREATE INDEX "SalesPromotion_sellerId_startsAt_idx" ON "SalesPromotion"("sellerId", "startsAt");

-- CreateIndex
CREATE INDEX "SalesPromotion_rewardProductId_idx" ON "SalesPromotion"("rewardProductId");

-- AddForeignKey
ALTER TABLE "SalesPromotion" ADD CONSTRAINT "SalesPromotion_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPromotion" ADD CONSTRAINT "SalesPromotion_rewardProductId_fkey" FOREIGN KEY ("rewardProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
