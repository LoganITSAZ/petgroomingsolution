-- Postgres does not treat NULLs as equal, so a unique index on
-- (type, species) never constrained species-agnostic rows. Key services by
-- their customer-facing name instead, and index the taxonomy for lookups.
DROP INDEX IF EXISTS "services_type_species_key";

CREATE UNIQUE INDEX "services_name_key" ON "services"("name");

CREATE INDEX "services_type_idx" ON "services"("type");
