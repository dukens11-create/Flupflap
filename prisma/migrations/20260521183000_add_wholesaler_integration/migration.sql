-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SupplierStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierRunType" AS ENUM ('CSV_IMPORT', 'API_SYNC');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierSyncTrigger" AS ENUM ('MANUAL', 'SCHEDULED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierRoutingStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_FULFILLMENT', 'FULFILLED', 'CANCELLED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierPayoutStatus" AS ENUM ('PENDING', 'PAYABLE', 'PAID', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "sourceSupplierProductId" TEXT,
  ADD COLUMN IF NOT EXISTS "wholesalerSupplierId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplierProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "companyName" TEXT,
  "status" "SupplierStatus" NOT NULL DEFAULT 'PENDING',
  "statusReason" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupplierProduct" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "wholesalePriceCents" INTEGER NOT NULL,
  "retailPriceCents" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "shippingWeightOz" DOUBLE PRECISION,
  "dimensionLengthIn" DOUBLE PRECISION,
  "dimensionWidthIn" DOUBLE PRECISION,
  "dimensionHeightIn" DOUBLE PRECISION,
  "brand" TEXT,
  "category" TEXT,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSyncedAt" TIMESTAMP(3),
  CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupplierImportRun" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "status" "SupplierRunStatus" NOT NULL DEFAULT 'PENDING',
  "sourceType" "SupplierRunType" NOT NULL DEFAULT 'CSV_IMPORT',
  "fileName" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "rowErrors" JSONB,
  CONSTRAINT "SupplierImportRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupplierSyncRun" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "trigger" "SupplierSyncTrigger" NOT NULL DEFAULT 'MANUAL',
  "status" "SupplierRunStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupplierOperationLog" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "importRunId" TEXT,
  "syncRunId" TEXT,
  "sku" TEXT,
  "rowNumber" INTEGER,
  "errorCode" TEXT NOT NULL,
  "errorMessage" TEXT NOT NULL,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierOperationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupplierOrderRouting" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "supplierUserId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "status" "SupplierRoutingStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierOrderRouting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupplierOrderRoutingItem" (
  "id" TEXT NOT NULL,
  "routingId" TEXT NOT NULL,
  "supplierProductId" TEXT NOT NULL,
  "orderItemId" TEXT,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierOrderRoutingItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupplierPayout" (
  "id" TEXT NOT NULL,
  "routingId" TEXT NOT NULL,
  "supplierAmountCents" INTEGER NOT NULL,
  "platformCommissionCents" INTEGER NOT NULL DEFAULT 0,
  "sellerCommissionCents" INTEGER NOT NULL DEFAULT 0,
  "status" "SupplierPayoutStatus" NOT NULL DEFAULT 'PENDING',
  "payableAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierProfile_userId_key" ON "SupplierProfile"("userId");
CREATE INDEX IF NOT EXISTS "SupplierProfile_status_idx" ON "SupplierProfile"("status");
CREATE INDEX IF NOT EXISTS "SupplierProduct_supplierId_isAvailable_idx" ON "SupplierProduct"("supplierId", "isAvailable");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierProduct_supplierId_sku_key" ON "SupplierProduct"("supplierId", "sku");
CREATE INDEX IF NOT EXISTS "SupplierSyncRun_supplierId_createdAt_idx" ON "SupplierSyncRun"("supplierId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupplierOperationLog_supplierId_createdAt_idx" ON "SupplierOperationLog"("supplierId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupplierOperationLog_importRunId_idx" ON "SupplierOperationLog"("importRunId");
CREATE INDEX IF NOT EXISTS "SupplierOperationLog_syncRunId_idx" ON "SupplierOperationLog"("syncRunId");
CREATE INDEX IF NOT EXISTS "SupplierOrderRouting_orderId_idx" ON "SupplierOrderRouting"("orderId");
CREATE INDEX IF NOT EXISTS "SupplierOrderRouting_supplierUserId_status_idx" ON "SupplierOrderRouting"("supplierUserId", "status");
CREATE INDEX IF NOT EXISTS "SupplierOrderRouting_sellerId_status_idx" ON "SupplierOrderRouting"("sellerId", "status");
CREATE INDEX IF NOT EXISTS "SupplierOrderRoutingItem_routingId_idx" ON "SupplierOrderRoutingItem"("routingId");
CREATE INDEX IF NOT EXISTS "SupplierOrderRoutingItem_supplierProductId_idx" ON "SupplierOrderRoutingItem"("supplierProductId");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPayout_routingId_key" ON "SupplierPayout"("routingId");
CREATE INDEX IF NOT EXISTS "SupplierPayout_status_payableAt_idx" ON "SupplierPayout"("status", "payableAt");
CREATE INDEX IF NOT EXISTS "Product_sourceSupplierProductId_idx" ON "Product"("sourceSupplierProductId");
CREATE INDEX IF NOT EXISTS "Product_wholesalerSupplierId_idx" ON "Product"("wholesalerSupplierId");

-- AddForeignKey
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_sourceSupplierProductId_fkey"
  FOREIGN KEY ("sourceSupplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_wholesalerSupplierId_fkey"
  FOREIGN KEY ("wholesalerSupplierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierProfile"
  ADD CONSTRAINT "SupplierProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierProfile"
  ADD CONSTRAINT "SupplierProfile_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierProduct"
  ADD CONSTRAINT "SupplierProduct_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierImportRun"
  ADD CONSTRAINT "SupplierImportRun_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierSyncRun"
  ADD CONSTRAINT "SupplierSyncRun_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierOperationLog"
  ADD CONSTRAINT "SupplierOperationLog_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierOperationLog"
  ADD CONSTRAINT "SupplierOperationLog_importRunId_fkey"
  FOREIGN KEY ("importRunId") REFERENCES "SupplierImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierOperationLog"
  ADD CONSTRAINT "SupplierOperationLog_syncRunId_fkey"
  FOREIGN KEY ("syncRunId") REFERENCES "SupplierSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierOrderRouting"
  ADD CONSTRAINT "SupplierOrderRouting_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierOrderRouting"
  ADD CONSTRAINT "SupplierOrderRouting_supplierUserId_fkey"
  FOREIGN KEY ("supplierUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierOrderRouting"
  ADD CONSTRAINT "SupplierOrderRouting_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierOrderRouting"
  ADD CONSTRAINT "SupplierOrderRouting_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierOrderRouting"
  ADD CONSTRAINT "SupplierOrderRouting_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierOrderRoutingItem"
  ADD CONSTRAINT "SupplierOrderRoutingItem_routingId_fkey"
  FOREIGN KEY ("routingId") REFERENCES "SupplierOrderRouting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierOrderRoutingItem"
  ADD CONSTRAINT "SupplierOrderRoutingItem_supplierProductId_fkey"
  FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierOrderRoutingItem"
  ADD CONSTRAINT "SupplierOrderRoutingItem_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierPayout"
  ADD CONSTRAINT "SupplierPayout_routingId_fkey"
  FOREIGN KEY ("routingId") REFERENCES "SupplierOrderRouting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
