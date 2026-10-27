-- Preserve the fact that an event's admission window was opened even after it
-- is later closed, so ordinary sale cancellation/refunds remain blocked.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "admissionStartedAt" TIMESTAMP(3);
