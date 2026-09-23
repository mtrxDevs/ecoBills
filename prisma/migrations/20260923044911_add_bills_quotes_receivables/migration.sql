-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('unpaid', 'partial', 'paid', 'void');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PurchaseBill" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "billNumber" TEXT NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'unpaid',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "grandTotal" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseBillLine" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "taxRateBps" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,

    CONSTRAINT "PurchaseBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "billId" TEXT,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'bank_transfer',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT,
    "quoteNumber" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'draft',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "grandTotal" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "convertedInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationLine" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "taxRateBps" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,

    CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseBill_businessId_idx" ON "PurchaseBill"("businessId");

-- CreateIndex
CREATE INDEX "PurchaseBill_businessId_supplierId_idx" ON "PurchaseBill"("businessId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseBill_businessId_supplierId_billNumber_key" ON "PurchaseBill"("businessId", "supplierId", "billNumber");

-- CreateIndex
CREATE INDEX "PurchaseBillLine_businessId_billId_idx" ON "PurchaseBillLine"("businessId", "billId");

-- CreateIndex
CREATE INDEX "SupplierPayment_businessId_supplierId_idx" ON "SupplierPayment"("businessId", "supplierId");

-- CreateIndex
CREATE INDEX "SupplierPayment_businessId_billId_idx" ON "SupplierPayment"("businessId", "billId");

-- CreateIndex
CREATE INDEX "Quotation_businessId_idx" ON "Quotation"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_businessId_quoteNumber_key" ON "Quotation"("businessId", "quoteNumber");

-- CreateIndex
CREATE INDEX "QuotationLine_businessId_quotationId_idx" ON "QuotationLine"("businessId", "quotationId");

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PurchaseBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PurchaseBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
