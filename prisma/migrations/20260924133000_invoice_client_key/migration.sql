-- AlterTable
-- clientKey is nullable: every pre-outbox invoice stays NULL, and PostgreSQL
-- treats NULLs as distinct, so the new unique constraint cannot conflict
-- with existing rows.
ALTER TABLE "Invoice" ADD COLUMN     "clientKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_businessId_clientKey_key" ON "Invoice"("businessId", "clientKey");
