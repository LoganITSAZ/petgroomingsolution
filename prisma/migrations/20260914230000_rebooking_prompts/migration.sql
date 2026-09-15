-- The rebooking nudge: one flag, one grace period, and a notification kind
-- anchored on the visit it chases.
ALTER TYPE "NotificationKind" ADD VALUE 'REBOOKING_PROMPT';

ALTER TABLE "system_config"
  ADD COLUMN "featureRebookingPrompts" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "rebookingGraceDays" INTEGER NOT NULL DEFAULT 7;
