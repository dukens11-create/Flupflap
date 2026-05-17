-- Add Product, Order, and OrderItem columns required by multi-image,
-- package-dimensions, live-shipping, pickup, analytics, commission, and
-- hierarchical-category features that were added to schema.prisma without
-- corresponding committed migrations.
--
-- ADD COLUMN IF NOT EXISTS is used throughout so this migration is idempotent
-- on databases where some columns already exist.

-- ── Product ──────────────────────────────────────────────────────────────────

ALTER TABLE "Product"
  -- Analytics / inventory tracking
  ADD COLUMN IF NOT EXISTS "soldQty"           INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "viewCount"         INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "delistedAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastViewedAt"      TIMESTAMP(3),

  -- Multi-image media fields
  ADD COLUMN IF NOT EXISTS "images"            TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "originalImages"    TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "enhancedImages"    TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "imageThumbnails"   TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "mainImage"         TEXT            NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "videoUrl"          TEXT,

  -- Package dimensions for live shipping rate calculation
  ADD COLUMN IF NOT EXISTS "weightOz"          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "weightUnit"        TEXT            NOT NULL DEFAULT 'lb',
  ADD COLUMN IF NOT EXISTS "lengthIn"          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "widthIn"           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "heightIn"          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "packageType"       TEXT,

  -- Shipping mode: FLAT | FREE | CALCULATED
  ADD COLUMN IF NOT EXISTS "shippingMode"      TEXT,

  -- Hierarchical category references
  ADD COLUMN IF NOT EXISTS "categoryId"        TEXT,
  ADD COLUMN IF NOT EXISTS "subcategoryId"     TEXT,

  -- Flexible category-specific attributes (JSON)
  ADD COLUMN IF NOT EXISTS "productAttributes" JSONB,

  -- Local pickup fields
  ADD COLUMN IF NOT EXISTS "pickupAvailable"   BOOLEAN         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pickupCity"        TEXT,
  ADD COLUMN IF NOT EXISTS "pickupState"       TEXT,
  ADD COLUMN IF NOT EXISTS "pickupPostalCode"  TEXT,

  -- Promotion tracking
  ADD COLUMN IF NOT EXISTS "isPromoted"        BOOLEAN         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "promotionStart"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "promotionEnd"      TIMESTAMP(3);

-- Indexes for hierarchical category lookups (safe to add even if they exist in some DBs)
CREATE INDEX IF NOT EXISTS "Product_categoryId_idx"    ON "Product"("categoryId");
CREATE INDEX IF NOT EXISTS "Product_subcategoryId_idx" ON "Product"("subcategoryId");

-- ── Order ─────────────────────────────────────────────────────────────────────

ALTER TABLE "Order"
  -- Order financial breakdown (subtotals added after initial schema)
  ADD COLUMN IF NOT EXISTS "subtotalCents"         INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "shippingCents"         INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxCents"              INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sellerPayoutCents"     INTEGER     NOT NULL DEFAULT 0,

  -- Extended shipping / tracking fields
  ADD COLUMN IF NOT EXISTS "carrier"               TEXT,
  ADD COLUMN IF NOT EXISTS "shippingService"       TEXT,
  ADD COLUMN IF NOT EXISTS "shippingCarrier"       TEXT,
  ADD COLUMN IF NOT EXISTS "trackingUrl"           TEXT,
  ADD COLUMN IF NOT EXISTS "labelUrl"              TEXT,
  ADD COLUMN IF NOT EXISTS "shipmentStatus"        TEXT,
  ADD COLUMN IF NOT EXISTS "shipmentId"            TEXT,
  ADD COLUMN IF NOT EXISTS "shippingName"          TEXT,
  ADD COLUMN IF NOT EXISTS "shippingLine1"         TEXT,
  ADD COLUMN IF NOT EXISTS "shippingLine2"         TEXT,
  ADD COLUMN IF NOT EXISTS "shippingCity"          TEXT,
  ADD COLUMN IF NOT EXISTS "shippingState"         TEXT,
  ADD COLUMN IF NOT EXISTS "shippingPostalCode"    TEXT,
  ADD COLUMN IF NOT EXISTS "shippingCountry"       TEXT,

  -- Local pickup order fields
  ADD COLUMN IF NOT EXISTS "isPickup"              BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pickupCity"            TEXT,
  ADD COLUMN IF NOT EXISTS "pickupState"           TEXT,
  ADD COLUMN IF NOT EXISTS "pickupCode"            TEXT,
  ADD COLUMN IF NOT EXISTS "pickupCodeAttempts"    INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pickupConfirmedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pickupConfirmedById"   TEXT,

  -- Stored shipment + selected-rate IDs for post-payment auto-label creation
  ADD COLUMN IF NOT EXISTS "selectedShipmentId"    TEXT,
  ADD COLUMN IF NOT EXISTS "selectedRateId"        TEXT;

-- ── OrderItem ─────────────────────────────────────────────────────────────────

ALTER TABLE "OrderItem"
  -- Per-line commission snapshot (stored at payment time for audit reporting)
  ADD COLUMN IF NOT EXISTS "lineSubtotalCents"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionRateBps"  INTEGER NOT NULL DEFAULT 700,
  ADD COLUMN IF NOT EXISTS "commissionFeeCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sellerNetCents"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionSource"   TEXT    NOT NULL DEFAULT 'DEFAULT',
  ADD COLUMN IF NOT EXISTS "commissionPlanCode" TEXT;
