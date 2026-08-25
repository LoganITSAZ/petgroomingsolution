-- Capacity becomes a shop-wide rule rather than a per-station field: groom
-- tables and bathing stations always hold one pet, and a kennel compartment
-- holds however many the shop allows.
ALTER TABLE "system_config"
  ADD COLUMN "kennelCapacityPerCompartment" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "stations" DROP COLUMN "maxOccupancy";

-- Occupancy moves from the door to the visit, so one compartment can hold
-- more than one pet.
ALTER TABLE "appointments" ADD COLUMN "kennelId" TEXT;
ALTER TABLE "appointments" ADD COLUMN "kenneledAt" TIMESTAMP(3);

UPDATE "appointments" a
SET "kennelId" = k."id", "kenneledAt" = k."occupiedAt"
FROM "kennels" k
WHERE k."appointmentId" = a."id";

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_kennelId_fkey"
  FOREIGN KEY ("kennelId") REFERENCES "kennels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "appointments_kennelId_idx" ON "appointments"("kennelId");

ALTER TABLE "kennels" DROP CONSTRAINT IF EXISTS "kennels_appointmentId_fkey";
DROP INDEX IF EXISTS "kennels_appointmentId_key";
ALTER TABLE "kennels" DROP COLUMN "appointmentId";
ALTER TABLE "kennels" DROP COLUMN "occupiedAt";
