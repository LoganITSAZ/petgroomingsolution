-- Automated voice calls: its own flag, and its own consent column.
ALTER TABLE "system_config" ADD COLUMN "featureVoiceCalls" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN "voiceOptOut" BOOLEAN NOT NULL DEFAULT false;
