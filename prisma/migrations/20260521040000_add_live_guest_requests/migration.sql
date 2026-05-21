-- CreateTable
CREATE TABLE "GarageSaleGuestRequest" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "guestName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GarageSaleGuestRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GarageSaleGuestRequest_saleId_status_idx" ON "GarageSaleGuestRequest"("saleId", "status");

-- CreateIndex
CREATE INDEX "GarageSaleGuestRequest_saleId_guestId_idx" ON "GarageSaleGuestRequest"("saleId", "guestId");

-- AddForeignKey
ALTER TABLE "GarageSaleGuestRequest" ADD CONSTRAINT "GarageSaleGuestRequest_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "GarageSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
