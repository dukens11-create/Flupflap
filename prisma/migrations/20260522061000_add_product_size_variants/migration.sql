-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductSizeType') THEN
    CREATE TYPE "ProductSizeType" AS ENUM ('BABY', 'CLOTHING', 'SHOES', 'PANTS', 'DRESS', 'CUSTOM');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductVariant" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sizeType" "ProductSizeType" NOT NULL,
  "sizeLabel" TEXT,
  "waist" TEXT,
  "length" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "productVariantId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "sizeType" "ProductSizeType";
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "sizeLabel" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "waist" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "length" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");
CREATE INDEX IF NOT EXISTS "OrderItem_productVariantId_idx" ON "OrderItem"("productVariantId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductVariant_productId_fkey'
  ) THEN
    ALTER TABLE "ProductVariant"
      ADD CONSTRAINT "ProductVariant_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_productVariantId_fkey'
  ) THEN
    ALTER TABLE "OrderItem"
      ADD CONSTRAINT "OrderItem_productVariantId_fkey"
      FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
