-- Extend ProductStatus lifecycle for seller drafts/scheduled publishing.
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
