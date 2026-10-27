-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('RECORDED', 'REVERSED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentAdjustmentType" AS ENUM ('REVERSAL', 'REFUND');

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerReference" TEXT,
    "notes" TEXT,
    "subtotalUgx" INTEGER NOT NULL,
    "discountUgx" INTEGER NOT NULL DEFAULT 0,
    "totalUgx" INTEGER NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceUgx" INTEGER NOT NULL,
    "discountUgx" INTEGER NOT NULL DEFAULT 0,
    "lineTotalUgx" INTEGER NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleTicket" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,

    CONSTRAINT "SaleTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "amountUgx" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "externalRef" TEXT,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'RECORDED',
    "recordedById" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAdjustment" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" "PaymentAdjustmentType" NOT NULL,
    "amountUgx" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_reference_key" ON "Sale"("reference");

-- CreateIndex
CREATE INDEX "Sale_eventId_createdAt_idx" ON "Sale"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_sellerId_createdAt_idx" ON "Sale"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_eventId_status_createdAt_idx" ON "Sale"("eventId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_sellerId_idempotencyKey_key" ON "Sale"("sellerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SaleItem_ticketTypeId_idx" ON "SaleItem"("ticketTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleItem_saleId_ticketTypeId_key" ON "SaleItem"("saleId", "ticketTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleTicket_ticketId_key" ON "SaleTicket"("ticketId");

-- CreateIndex
CREATE INDEX "SaleTicket_saleId_idx" ON "SaleTicket"("saleId");

-- CreateIndex
CREATE INDEX "SaleTicket_saleItemId_idx" ON "SaleTicket"("saleItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_saleId_recordedAt_idx" ON "Payment"("saleId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAdjustment_idempotencyKey_key" ON "PaymentAdjustment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentAdjustment_paymentId_createdAt_idx" ON "PaymentAdjustment"("paymentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleTicket" ADD CONSTRAINT "SaleTicket_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleTicket" ADD CONSTRAINT "SaleTicket_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleTicket" ADD CONSTRAINT "SaleTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants for UGX values, positive quantities and append-only adjustments.
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_amounts_valid" CHECK ("subtotalUgx" >= 0 AND "discountUgx" >= 0 AND "totalUgx" >= 0 AND "totalUgx" = "subtotalUgx" - "discountUgx");
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_amounts_valid" CHECK ("quantity" > 0 AND "unitPriceUgx" >= 0 AND "discountUgx" >= 0 AND "lineTotalUgx" = "quantity" * "unitPriceUgx" - "discountUgx" AND "lineTotalUgx" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountUgx" > 0);
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_amount_positive" CHECK ("amountUgx" > 0 AND length(trim("reason")) > 0);
