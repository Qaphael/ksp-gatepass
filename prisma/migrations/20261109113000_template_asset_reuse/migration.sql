DROP INDEX "TicketTemplate_assetStorageKey_key";
CREATE INDEX "TicketTemplate_assetStorageKey_idx" ON "TicketTemplate"("assetStorageKey");
