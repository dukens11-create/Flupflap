-- CreateEnum
CREATE TYPE "GarageSaleType" AS ENUM ('GARAGE_SALE', 'YARD_SALE', 'ESTATE_SALE', 'MOVING_SALE');

-- CreateEnum
CREATE TYPE "GarageSaleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "GarageSalePromotionType" AS ENUM ('FEATURED', 'HOMEPAGE_BOOST', 'LOCAL_AREA_BOOST', 'WEEKEND_PROMOTION');

-- CreateTable
CREATE TABLE "GarageSale" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "saleType" "GarageSaleType" NOT NULL DEFAULT 'GARAGE_SALE',
    "status" "GarageSaleStatus" NOT NULL DEFAULT 'PENDING',
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sellerPhone" TEXT,
    "priceRangeMin" DOUBLE PRECISION,
    "priceRangeMax" DOUBLE PRECISION,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "promotionType" "GarageSalePromotionType",
    "promotionStart" TIMESTAMP(3),
    "promotionEnd" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "adminNotes" TEXT,
    "isSpam" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GarageSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarageSaleReport" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "adminNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GarageSaleReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarageSaleFavorite" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GarageSaleFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GarageSale_sellerId_idx" ON "GarageSale"("sellerId");

-- CreateIndex
CREATE INDEX "GarageSale_status_idx" ON "GarageSale"("status");

-- CreateIndex
CREATE INDEX "GarageSale_city_state_idx" ON "GarageSale"("city", "state");

-- CreateIndex
CREATE INDEX "GarageSale_zipCode_idx" ON "GarageSale"("zipCode");

-- CreateIndex
CREATE INDEX "GarageSale_startDate_endDate_idx" ON "GarageSale"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "GarageSale_isFeatured_idx" ON "GarageSale"("isFeatured");

-- CreateIndex
CREATE INDEX "GarageSale_latitude_longitude_idx" ON "GarageSale"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "GarageSaleReport_saleId_idx" ON "GarageSaleReport"("saleId");

-- CreateIndex
CREATE INDEX "GarageSaleReport_status_idx" ON "GarageSaleReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GarageSaleReport_saleId_reporterId_key" ON "GarageSaleReport"("saleId", "reporterId");

-- CreateIndex
CREATE INDEX "GarageSaleFavorite_userId_idx" ON "GarageSaleFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GarageSaleFavorite_saleId_userId_key" ON "GarageSaleFavorite"("saleId", "userId");

-- AddForeignKey
ALTER TABLE "GarageSale" ADD CONSTRAINT "GarageSale_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarageSaleReport" ADD CONSTRAINT "GarageSaleReport_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "GarageSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarageSaleFavorite" ADD CONSTRAINT "GarageSaleFavorite_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "GarageSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
