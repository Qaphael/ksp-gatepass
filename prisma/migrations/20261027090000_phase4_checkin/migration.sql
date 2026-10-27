-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('QR', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScanMethod" AS ENUM ('QR', 'SERIAL');

-- CreateEnum
CREATE TYPE "ScanResultCode" AS ENUM ('ELIGIBLE', 'ADMITTED', 'INVALID_QR', 'UNKNOWN_SERIAL', 'OTHER_EVENT', 'NOT_PAID', 'TICKET_CANCELLED', 'TICKET_REVOKED', 'ALREADY_USED', 'NOT_YET_VALID', 'EXPIRED', 'ADMISSION_CLOSED', 'TICKET_NOT_SOLD', 'CATEGORY_NOT_ADMISSIBLE');

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "verifierId" TEXT NOT NULL,
    "gate" TEXT NOT NULL,
    "method" "CheckInMethod" NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanAttempt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "ticketId" TEXT,
    "method" "ScanMethod" NOT NULL,
    "resultCode" "ScanResultCode" NOT NULL,
    "gate" TEXT,
    "serial" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInCorrection" (
    "id" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "confirmedTicketSerial" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_ticketId_key" ON "CheckIn"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_idempotencyKey_key" ON "CheckIn"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CheckIn_eventId_checkedInAt_idx" ON "CheckIn"("eventId", "checkedInAt");

-- CreateIndex
CREATE INDEX "CheckIn_verifierId_checkedInAt_idx" ON "CheckIn"("verifierId", "checkedInAt");

-- CreateIndex
CREATE INDEX "CheckIn_eventId_gate_checkedInAt_idx" ON "CheckIn"("eventId", "gate", "checkedInAt");

-- CreateIndex
CREATE INDEX "ScanAttempt_eventId_attemptedAt_idx" ON "ScanAttempt"("eventId", "attemptedAt");

-- CreateIndex
CREATE INDEX "ScanAttempt_actorId_attemptedAt_idx" ON "ScanAttempt"("actorId", "attemptedAt");

-- CreateIndex
CREATE INDEX "ScanAttempt_eventId_resultCode_attemptedAt_idx" ON "ScanAttempt"("eventId", "resultCode", "attemptedAt");

-- CreateIndex
CREATE INDEX "ScanAttempt_ticketId_attemptedAt_idx" ON "ScanAttempt"("ticketId", "attemptedAt");

-- CreateIndex
CREATE INDEX "CheckInCorrection_checkInId_createdAt_idx" ON "CheckInCorrection"("checkInId", "createdAt");

-- CreateIndex
CREATE INDEX "CheckInCorrection_actorId_createdAt_idx" ON "CheckInCorrection"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_verifierId_fkey" FOREIGN KEY ("verifierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAttempt" ADD CONSTRAINT "ScanAttempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAttempt" ADD CONSTRAINT "ScanAttempt_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAttempt" ADD CONSTRAINT "ScanAttempt_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInCorrection" ADD CONSTRAINT "CheckInCorrection_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInCorrection" ADD CONSTRAINT "CheckInCorrection_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_gate_required" CHECK (length(trim("gate")) > 0);
ALTER TABLE "CheckInCorrection" ADD CONSTRAINT "CheckInCorrection_reason_required" CHECK (length(trim("reason")) > 0 AND length(trim("confirmedTicketSerial")) > 0);
