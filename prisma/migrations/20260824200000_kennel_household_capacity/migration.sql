-- Pets from one household may share a compartment beyond the shop-wide rule.
ALTER TABLE "system_config"
  ADD COLUMN "kennelHouseholdMaxPerCompartment" INTEGER NOT NULL DEFAULT 5;
