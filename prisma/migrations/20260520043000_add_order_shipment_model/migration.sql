-- CreateTable: per-seller shipment/tracking records for multi-seller orders.
-- Existing orders remain valid; this table starts empty and is populated
-- by new ship API calls and webhook auto-label purchases going forward.
CREATE TABLE IF NOT EXISTS "OrderShipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "shipmentStatus" TEXT,
    "trackingNumber" TEXT,
    "carrier" TEXT,
    "shippingService" TEXT,
    "labelUrl" TEXT,
    "trackingUrl" TEXT,
    "labelPurchaseIdempotencyKey" TEXT,
    "labelProviderTransactionId" TEXT,
    "labelPurchasedAt" TIMESTAMP(3),
    "labelPurchaseLastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderShipment_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex: one row per seller per order
CREATE UNIQUE INDEX IF NOT EXISTS "OrderShipment_orderId_sellerId_key" ON "OrderShipment"("orderId", "sellerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderShipment_orderId_idx" ON "OrderShipment"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderShipment_sellerId_idx" ON "OrderShipment"("sellerId");

-- AddForeignKey
ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
