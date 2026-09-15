-- Three things a grooming shop keeps that the schema had nowhere for.
--
-- 1. The groom record: the blade and shampoo actually used, per visit, so the
--    next groomer repeats the cut rather than guessing at it.
-- 2. Consent: what the owner agreed to when the groom could not be done as
--    booked — matting found on the table, a coat that has to come off.
-- 3. Health findings the groomer notices and the owner wants to hear about,
--    as a VisitEvent type plus a flag saying this one is theirs to see.

ALTER TYPE "VisitEventType" ADD VALUE IF NOT EXISTS 'HEALTH_FINDING' BEFORE 'REWASH';

ALTER TABLE "visit_events" ADD COLUMN "ownerVisible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "appointments"
  ADD COLUMN "groomBlade" TEXT,
  ADD COLUMN "groomShampoo" TEXT,
  ADD COLUMN "groomRecordNotes" TEXT,
  ADD COLUMN "consentRequestedAt" TIMESTAMP(3),
  ADD COLUMN "consentNote" TEXT,
  ADD COLUMN "consentGrantedAt" TIMESTAMP(3),
  ADD COLUMN "consentDeclinedAt" TIMESTAMP(3);

ALTER TABLE "pets"
  ADD COLUMN "vetName" TEXT,
  ADD COLUMN "vetPhone" TEXT;
