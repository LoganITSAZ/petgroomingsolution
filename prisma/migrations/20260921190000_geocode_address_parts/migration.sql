-- The city, state and postal code the geocoder resolved. Existing rows keep
-- their coordinates and refresh their parts on the next read.
ALTER TABLE "geocode_cache" ADD COLUMN "city" TEXT;
ALTER TABLE "geocode_cache" ADD COLUMN "region" TEXT;
ALTER TABLE "geocode_cache" ADD COLUMN "postalCode" TEXT;
