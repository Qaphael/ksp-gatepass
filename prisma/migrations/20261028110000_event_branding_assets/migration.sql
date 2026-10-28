CREATE TYPE "EventBrandingKind" AS ENUM ('POSTER', 'LOGO');

CREATE TABLE "EventBrandingAsset" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "kind" "EventBrandingKind" NOT NULL,
  "storageKey" TEXT NOT NULL,
  "thumbnailKey" TEXT NOT NULL,
  "displayKey" TEXT NOT NULL,
  "altText" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventBrandingAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventBrandingAsset_width_check" CHECK ("width" > 0 AND "width" <= 20000),
  CONSTRAINT "EventBrandingAsset_height_check" CHECK ("height" > 0 AND "height" <= 20000),
  CONSTRAINT "EventBrandingAsset_pixels_check" CHECK ("width" * "height" <= 40000000),
  CONSTRAINT "EventBrandingAsset_altText_check" CHECK (char_length(btrim("altText")) > 0)
);

CREATE UNIQUE INDEX "EventBrandingAsset_storageKey_key" ON "EventBrandingAsset"("storageKey");
CREATE UNIQUE INDEX "EventBrandingAsset_thumbnailKey_key" ON "EventBrandingAsset"("thumbnailKey");
CREATE UNIQUE INDEX "EventBrandingAsset_displayKey_key" ON "EventBrandingAsset"("displayKey");
CREATE UNIQUE INDEX "EventBrandingAsset_eventId_kind_key" ON "EventBrandingAsset"("eventId", "kind");
CREATE INDEX "EventBrandingAsset_eventId_idx" ON "EventBrandingAsset"("eventId");

ALTER TABLE "EventBrandingAsset"
ADD CONSTRAINT "EventBrandingAsset_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
