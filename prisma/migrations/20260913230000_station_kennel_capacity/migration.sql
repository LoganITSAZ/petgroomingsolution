-- Capacity moves from the shop to the unit: a bank of small crates and a bank
-- of walk-in runs are not the same size. Existing banks keep the shop's rule.
ALTER TABLE "stations" ADD COLUMN "kennelCapacityPerCompartment" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "stations" ADD COLUMN "kennelHouseholdMaxPerCompartment" INTEGER NOT NULL DEFAULT 5;

UPDATE "stations" SET
  "kennelCapacityPerCompartment" = "system_config"."kennelCapacityPerCompartment",
  "kennelHouseholdMaxPerCompartment" = "system_config"."kennelHouseholdMaxPerCompartment"
FROM "system_config"
WHERE "system_config"."id" = 'global';

ALTER TABLE "system_config" DROP COLUMN "kennelCapacityPerCompartment";
ALTER TABLE "system_config" DROP COLUMN "kennelHouseholdMaxPerCompartment";
