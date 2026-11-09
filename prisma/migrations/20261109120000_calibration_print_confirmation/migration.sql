ALTER TABLE "TicketTemplate"
ADD COLUMN "calibrationPrintedById" TEXT;

ALTER TABLE "TicketTemplate"
ADD CONSTRAINT "TicketTemplate_calibrationPrintedById_fkey"
FOREIGN KEY ("calibrationPrintedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
