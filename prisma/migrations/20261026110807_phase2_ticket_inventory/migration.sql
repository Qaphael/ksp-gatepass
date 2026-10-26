-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'CANCELLED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PrintKind" AS ENUM ('SAMPLE', 'PRODUCTION', 'REPRINT', 'EXPORT');

-- CreateTable
CREATE TABLE "TicketBatch" (
    "id" TEXT NOT NULL,
    "batchRef" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "serialPrefix" TEXT NOT NULL,
    "serialStart" INTEGER NOT NULL,
    "serialEnd" INTEGER NOT NULL,
    "label" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "batchId" TEXT,
    "serial" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'AVAILABLE',
    "revokeReason" TEXT,
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintBatch" (
    "id" TEXT NOT NULL,
    "kind" "PrintKind" NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketBatchId" TEXT,
    "ticketId" TEXT,
    "ticketCount" INTEGER NOT NULL,
    "metadata" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketBatch_batchRef_key" ON "TicketBatch"("batchRef");

-- CreateIndex
CREATE UNIQUE INDEX "TicketBatch_idempotencyKey_key" ON "TicketBatch"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TicketBatch_eventId_createdAt_idx" ON "TicketBatch"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketBatch_ticketTypeId_idx" ON "TicketBatch"("ticketTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_serial_key" ON "Ticket"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_tokenHash_key" ON "Ticket"("tokenHash");

-- CreateIndex
CREATE INDEX "Ticket_eventId_status_idx" ON "Ticket"("eventId", "status");

-- CreateIndex
CREATE INDEX "Ticket_ticketTypeId_status_idx" ON "Ticket"("ticketTypeId", "status");

-- CreateIndex
CREATE INDEX "Ticket_batchId_idx" ON "Ticket"("batchId");

-- CreateIndex
CREATE INDEX "Ticket_serial_idx" ON "Ticket"("serial");

-- CreateIndex
CREATE INDEX "PrintBatch_eventId_createdAt_idx" ON "PrintBatch"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "PrintBatch_ticketBatchId_idx" ON "PrintBatch"("ticketBatchId");

-- CreateIndex
CREATE INDEX "PrintBatch_ticketId_createdAt_idx" ON "PrintBatch"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "TicketBatch" ADD CONSTRAINT "TicketBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketBatch" ADD CONSTRAINT "TicketBatch_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TicketBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintBatch" ADD CONSTRAINT "PrintBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintBatch" ADD CONSTRAINT "PrintBatch_ticketBatchId_fkey" FOREIGN KEY ("ticketBatchId") REFERENCES "TicketBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintBatch" ADD CONSTRAINT "PrintBatch_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
