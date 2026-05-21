ALTER TABLE "GarageSaleGuestRequest" RENAME TO "live_join_requests";
ALTER TABLE "live_join_requests" RENAME COLUMN "saleId" TO "liveSaleId";

ALTER TABLE "live_join_requests"
  ADD COLUMN "sellerId" TEXT,
  ADD COLUMN "viewerId" TEXT,
  ADD COLUMN "viewerAvatar" TEXT;

UPDATE "live_join_requests" AS ljr
SET
  "sellerId" = gs."sellerId",
  "viewerId" = COALESCE(NULLIF(ljr."guestId", ''), ljr."id")
FROM "GarageSale" AS gs
WHERE gs."id" = ljr."liveSaleId";

ALTER TABLE "live_join_requests"
  ALTER COLUMN "sellerId" SET NOT NULL,
  ALTER COLUMN "viewerId" SET NOT NULL;

UPDATE "live_join_requests"
SET "status" = CASE
  WHEN "status" = 'PENDING' THEN 'pending'
  WHEN "status" = 'APPROVED' THEN 'accepted'
  WHEN "status" = 'ACTIVE' THEN 'accepted'
  WHEN "status" = 'DECLINED' THEN 'declined'
  WHEN "status" = 'REMOVED' THEN 'removed'
  WHEN "status" = 'ENDED' THEN 'removed'
  ELSE LOWER("status")
END;

ALTER TABLE "live_join_requests"
  ALTER COLUMN "status" SET DEFAULT 'pending';

DROP INDEX IF EXISTS "GarageSaleGuestRequest_saleId_status_idx";
DROP INDEX IF EXISTS "GarageSaleGuestRequest_saleId_guestId_idx";

CREATE INDEX "live_join_requests_liveSaleId_status_idx" ON "live_join_requests"("liveSaleId", "status");
CREATE INDEX "live_join_requests_liveSaleId_guestId_idx" ON "live_join_requests"("liveSaleId", "guestId");
CREATE INDEX "live_join_requests_liveSaleId_viewerId_idx" ON "live_join_requests"("liveSaleId", "viewerId");
CREATE INDEX "live_join_requests_sellerId_status_idx" ON "live_join_requests"("sellerId", "status");

ALTER TABLE "live_join_requests" DROP CONSTRAINT IF EXISTS "GarageSaleGuestRequest_saleId_fkey";
ALTER TABLE "live_join_requests"
  ADD CONSTRAINT "live_join_requests_liveSaleId_fkey"
  FOREIGN KEY ("liveSaleId") REFERENCES "GarageSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
