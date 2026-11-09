-- The shop's clock was a constant in lib/utils.ts. Existing shops keep the
-- zone they have been running on; a new one picks its own in Shop Settings.
ALTER TABLE "system_config" ADD COLUMN "shopTimezone" TEXT NOT NULL DEFAULT 'America/Phoenix';
