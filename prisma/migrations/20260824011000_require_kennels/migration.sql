-- All visits require kennel capacity; preserve the invariant for existing data.
UPDATE "appointments" SET "needsKennel" = true WHERE "needsKennel" = false;

ALTER TABLE "appointments"
ALTER COLUMN "needsKennel" SET DEFAULT true;