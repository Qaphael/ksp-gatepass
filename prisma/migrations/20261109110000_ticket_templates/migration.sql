CREATE TYPE "TicketTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "TicketTemplateOutputKind" AS ENUM ('SHEET', 'SINGLE', 'DATA_LAYER', 'CALIBRATION');

ALTER TABLE "PrintBatch"
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "templateVersion" INTEGER,
  ADD COLUMN "sheetLayoutSnapshot" JSONB,
  ADD COLUMN "outputKind" "TicketTemplateOutputKind";

ALTER TABLE "PrintBatch"
  ADD CONSTRAINT "PrintBatch_templateVersion_positive_check"
    CHECK ("templateVersion" IS NULL OR "templateVersion" > 0),
  ADD CONSTRAINT "PrintBatch_template_metadata_check"
    CHECK (("templateId" IS NULL AND "templateVersion" IS NULL)
        OR ("templateId" IS NOT NULL AND "templateVersion" IS NOT NULL));

CREATE TABLE "TicketTemplate" (
  "id" TEXT NOT NULL,
  "seriesId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "ticketTypeId" TEXT,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "assetStorageKey" TEXT NOT NULL,
  "assetChecksum" TEXT NOT NULL,
  "assetWidthPx" INTEGER NOT NULL,
  "assetHeightPx" INTEGER NOT NULL,
  "trim" JSONB NOT NULL,
  "bleedMm" DOUBLE PRECISION NOT NULL,
  "config" JSONB NOT NULL,
  "status" "TicketTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "zonesArePlaceholder" BOOLEAN NOT NULL DEFAULT false,
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "calibrationPrintedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TicketTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TicketTemplate_version_positive_check" CHECK ("version" > 0),
  CONSTRAINT "TicketTemplate_asset_dimensions_check" CHECK ("assetWidthPx" > 0 AND "assetHeightPx" > 0),
  CONSTRAINT "TicketTemplate_bleed_nonnegative_check" CHECK ("bleedMm" >= 0)
);

CREATE UNIQUE INDEX "TicketTemplate_assetStorageKey_key" ON "TicketTemplate"("assetStorageKey");
CREATE UNIQUE INDEX "TicketTemplate_seriesId_version_key" ON "TicketTemplate"("seriesId", "version");
CREATE INDEX "TicketTemplate_eventId_status_createdAt_idx" ON "TicketTemplate"("eventId", "status", "createdAt");
CREATE INDEX "TicketTemplate_ticketTypeId_idx" ON "TicketTemplate"("ticketTypeId");

ALTER TABLE "TicketTemplate"
  ADD CONSTRAINT "TicketTemplate_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TicketTemplate_ticketTypeId_fkey"
    FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TicketTemplate_confirmedById_fkey"
    FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PrintBatch"
  ADD CONSTRAINT "PrintBatch_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "TicketTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PrintBatch_templateId_idx" ON "PrintBatch"("templateId");

CREATE TABLE "TicketTemplateMutation" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketTemplateMutation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketTemplateMutation_actorId_operation_idempotencyKey_key"
  ON "TicketTemplateMutation"("actorId", "operation", "idempotencyKey");
CREATE INDEX "TicketTemplateMutation_eventId_createdAt_idx"
  ON "TicketTemplateMutation"("eventId", "createdAt");

ALTER TABLE "TicketTemplateMutation"
  ADD CONSTRAINT "TicketTemplateMutation_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TicketTemplateMutation_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TicketTemplateMutation_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "TicketTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
