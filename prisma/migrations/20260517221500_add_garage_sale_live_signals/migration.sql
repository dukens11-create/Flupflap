-- CreateTable
CREATE TABLE "GarageSaleLiveSignal" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GarageSaleLiveSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GarageSaleLiveSignal_saleId_createdAt_idx" ON "GarageSaleLiveSignal"("saleId", "createdAt");

-- CreateIndex
CREATE INDEX "GarageSaleLiveSignal_saleId_sender_kind_idx" ON "GarageSaleLiveSignal"("saleId", "sender", "kind");

-- AddForeignKey
ALTER TABLE "GarageSaleLiveSignal" ADD CONSTRAINT "GarageSaleLiveSignal_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "GarageSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
