CREATE TYPE "ScanPurpose" AS ENUM ('ADMISSION', 'SALE');
CREATE TYPE "SaleEntryMethod" AS ENUM ('SCAN', 'MANUAL', 'BULK');

ALTER TYPE "ScanResultCode" ADD VALUE 'SALEABLE';
ALTER TYPE "ScanResultCode" ADD VALUE 'ALREADY_SOLD';
ALTER TYPE "ScanResultCode" ADD VALUE 'ISSUED_TO_ANOTHER_SELLER';
ALTER TYPE "ScanResultCode" ADD VALUE 'NOT_ISSUED_TO_YOU';
ALTER TYPE "ScanResultCode" ADD VALUE 'SALES_CLOSED';
ALTER TYPE "ScanResultCode" ADD VALUE 'TICKET_TYPE_INACTIVE';
ALTER TYPE "ScanResultCode" ADD VALUE 'EVENT_NOT_SELLING';

ALTER TABLE "Event"
  ADD COLUMN "requireBuyerDetails" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "requireStockIssue" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "allowSellerManualSale" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "requireFullPaymentAtSale" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "buyerNoticeText" TEXT;

ALTER TABLE "Sale"
  ADD COLUMN "customerPhoneNormalized" TEXT;

ALTER TABLE "SaleTicket"
  ADD COLUMN "entryMethod" "SaleEntryMethod" NOT NULL DEFAULT 'BULK',
  ADD COLUMN "scannedAt" TIMESTAMP(3);

ALTER TABLE "ScanAttempt"
  ADD COLUMN "purpose" "ScanPurpose" NOT NULL DEFAULT 'ADMISSION';

CREATE INDEX "ScanAttempt_actorId_purpose_attemptedAt_idx"
  ON "ScanAttempt"("actorId", "purpose", "attemptedAt");
CREATE INDEX "ScanAttempt_eventId_purpose_attemptedAt_idx"
  ON "ScanAttempt"("eventId", "purpose", "attemptedAt");
