-- Phase 2 CHECK constraints Prisma 7 cannot express in schema.prisma yet.

-- Batch generation basics.
ALTER TABLE "TicketBatch" ADD CONSTRAINT "TicketBatch_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "TicketBatch" ADD CONSTRAINT "TicketBatch_serial_range_valid" CHECK (
    "serialStart" >= 0
    AND "serialEnd" >= "serialStart"
);

-- Every printed/exported output must cover at least one ticket.
ALTER TABLE "PrintBatch" ADD CONSTRAINT "PrintBatch_ticket_count_positive" CHECK ("ticketCount" > 0);

-- Revocation always carries a reason (PRD 5.6/5.13, business rule 11).
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_revoke_reason_required" CHECK (
    "status" <> 'REVOKED' OR "revokeReason" IS NOT NULL
);
