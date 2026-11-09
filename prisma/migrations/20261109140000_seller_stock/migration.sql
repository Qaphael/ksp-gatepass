CREATE TYPE "CustodyReleaseReason" AS ENUM ('SOLD', 'RETURNED', 'LOST', 'REASSIGNED');
CREATE TYPE "StockOperationKind" AS ENUM ('RETURN', 'LOSS');

CREATE TABLE "StockIssue" (
  "id" TEXT NOT NULL,
  "slipReference" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "issuedById" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  CONSTRAINT "StockIssue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockIssue_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockIssue_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockIssue_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockIssue_slipReference_key" ON "StockIssue"("slipReference");
CREATE UNIQUE INDEX "StockIssue_issuedById_idempotencyKey_key" ON "StockIssue"("issuedById", "idempotencyKey");
CREATE INDEX "StockIssue_eventId_issuedAt_idx" ON "StockIssue"("eventId", "issuedAt");
CREATE INDEX "StockIssue_sellerId_issuedAt_idx" ON "StockIssue"("sellerId", "issuedAt");

CREATE TABLE "TicketCustody" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "stockIssueId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "issuedById" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "releaseReason" "CustodyReleaseReason",
  "releasedById" TEXT,
  "releaseNote" TEXT,
  CONSTRAINT "TicketCustody_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TicketCustody_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TicketCustody_stockIssueId_fkey" FOREIGN KEY ("stockIssueId") REFERENCES "StockIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TicketCustody_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TicketCustody_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TicketCustody_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TicketCustody_release_state_check" CHECK (("releasedAt" IS NULL AND "releaseReason" IS NULL AND "releasedById" IS NULL) OR ("releasedAt" IS NOT NULL AND "releaseReason" IS NOT NULL AND "releasedById" IS NOT NULL))
);
CREATE UNIQUE INDEX "TicketCustody_one_active_holder_per_ticket" ON "TicketCustody"("ticketId") WHERE "releasedAt" IS NULL;
CREATE INDEX "TicketCustody_sellerId_releasedAt_issuedAt_idx" ON "TicketCustody"("sellerId", "releasedAt", "issuedAt");
CREATE INDEX "TicketCustody_stockIssueId_idx" ON "TicketCustody"("stockIssueId");
CREATE INDEX "TicketCustody_ticketId_issuedAt_idx" ON "TicketCustody"("ticketId", "issuedAt");

CREATE TABLE "StockOperation" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "operation" "StockOperationKind" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockOperation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockOperation_actorId_operation_idempotencyKey_key" ON "StockOperation"("actorId", "operation", "idempotencyKey");
CREATE INDEX "StockOperation_eventId_createdAt_idx" ON "StockOperation"("eventId", "createdAt");

CREATE TABLE "StockCloseout" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "closedById" TEXT NOT NULL,
  "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outstandingCount" INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  CONSTRAINT "StockCloseout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockCloseout_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCloseout_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCloseout_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockCloseout_outstandingCount_check" CHECK ("outstandingCount" >= 0)
);
CREATE UNIQUE INDEX "StockCloseout_eventId_sellerId_key" ON "StockCloseout"("eventId", "sellerId");
CREATE UNIQUE INDEX "StockCloseout_closedById_idempotencyKey_key" ON "StockCloseout"("closedById", "idempotencyKey");
CREATE INDEX "StockCloseout_sellerId_closedAt_idx" ON "StockCloseout"("sellerId", "closedAt");

CREATE TABLE "Remittance" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "amountUgx" INTEGER NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "receivedById" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "note" TEXT,
  "reversesId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Remittance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Remittance_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Remittance_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Remittance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Remittance_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "Remittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Remittance_amountUgx_check" CHECK ("amountUgx" >= 0),
  CONSTRAINT "Remittance_no_self_reversal_check" CHECK ("reversesId" IS NULL OR "reversesId" <> "id")
);
CREATE UNIQUE INDEX "Remittance_recordedById_idempotencyKey_key" ON "Remittance"("recordedById", "idempotencyKey");
CREATE UNIQUE INDEX "Remittance_reversesId_key" ON "Remittance"("reversesId");
CREATE INDEX "Remittance_eventId_sellerId_recordedAt_idx" ON "Remittance"("eventId", "sellerId", "recordedAt");
CREATE INDEX "Remittance_sellerId_recordedAt_idx" ON "Remittance"("sellerId", "recordedAt");
