-- CreateEnum
CREATE TYPE "SupplierProvider" AS ENUM ('CJ', 'FAIRE', 'ALIBABA', 'SPOCKET');

-- CreateEnum
CREATE TYPE "SupplierSyncStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SupplierSyncOperation" AS ENUM ('PRODUCT_SYNC', 'INVENTORY_SYNC', 'ORDER_ROUTING');

-- CreateEnum
CREATE TYPE "SupplierRoutingStatus" AS ENUM ('PENDING_SUBMISSION', 'SUBMISSION_SKIPPED', 'SUBMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "SupplierCatalogItem" (
    "id" TEXT NOT NULL,
    "provider" "SupplierProvider" NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER,
    "currency" TEXT,
    "inventory" INTEGER,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "rawPayload" JSONB,
    "mappedProductId" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierSyncRun" (
    "id" TEXT NOT NULL,
    "provider" "SupplierProvider" NOT NULL,
    "operation" "SupplierSyncOperation" NOT NULL,
    "status" "SupplierSyncStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "upsertedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrderRouting" (
    "id" TEXT NOT NULL,
    "provider" "SupplierProvider" NOT NULL,
    "platformOrderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "supplierCatalogItemId" TEXT,
    "supplierOrderId" TEXT,
    "status" "SupplierRoutingStatus" NOT NULL DEFAULT 'PENDING_SUBMISSION',
    "submissionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierOrderRouting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierIntegrationErrorLog" (
    "id" TEXT NOT NULL,
    "provider" "SupplierProvider" NOT NULL,
    "operation" "SupplierSyncOperation" NOT NULL,
    "requestContext" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT NOT NULL,
    "syncRunId" TEXT,
    "orderRoutingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierIntegrationErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCatalogItem_provider_externalProductId_key" ON "SupplierCatalogItem"("provider", "externalProductId");

-- CreateIndex
CREATE INDEX "SupplierCatalogItem_mappedProductId_idx" ON "SupplierCatalogItem"("mappedProductId");

-- CreateIndex
CREATE INDEX "SupplierCatalogItem_provider_available_idx" ON "SupplierCatalogItem"("provider", "available");

-- CreateIndex
CREATE INDEX "SupplierSyncRun_provider_operation_createdAt_idx" ON "SupplierSyncRun"("provider", "operation", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierSyncRun_status_createdAt_idx" ON "SupplierSyncRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOrderRouting_provider_platformOrderId_orderItemId_key" ON "SupplierOrderRouting"("provider", "platformOrderId", "orderItemId");

-- CreateIndex
CREATE INDEX "SupplierOrderRouting_platformOrderId_idx" ON "SupplierOrderRouting"("platformOrderId");

-- CreateIndex
CREATE INDEX "SupplierOrderRouting_provider_status_idx" ON "SupplierOrderRouting"("provider", "status");

-- CreateIndex
CREATE INDEX "SupplierOrderRouting_supplierCatalogItemId_idx" ON "SupplierOrderRouting"("supplierCatalogItemId");

-- CreateIndex
CREATE INDEX "SupplierIntegrationErrorLog_provider_operation_createdAt_idx" ON "SupplierIntegrationErrorLog"("provider", "operation", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierIntegrationErrorLog_syncRunId_idx" ON "SupplierIntegrationErrorLog"("syncRunId");

-- CreateIndex
CREATE INDEX "SupplierIntegrationErrorLog_orderRoutingId_idx" ON "SupplierIntegrationErrorLog"("orderRoutingId");

-- AddForeignKey
ALTER TABLE "SupplierCatalogItem" ADD CONSTRAINT "SupplierCatalogItem_mappedProductId_fkey" FOREIGN KEY ("mappedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderRouting" ADD CONSTRAINT "SupplierOrderRouting_platformOrderId_fkey" FOREIGN KEY ("platformOrderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderRouting" ADD CONSTRAINT "SupplierOrderRouting_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderRouting" ADD CONSTRAINT "SupplierOrderRouting_supplierCatalogItemId_fkey" FOREIGN KEY ("supplierCatalogItemId") REFERENCES "SupplierCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierIntegrationErrorLog" ADD CONSTRAINT "SupplierIntegrationErrorLog_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SupplierSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierIntegrationErrorLog" ADD CONSTRAINT "SupplierIntegrationErrorLog_orderRoutingId_fkey" FOREIGN KEY ("orderRoutingId") REFERENCES "SupplierOrderRouting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
