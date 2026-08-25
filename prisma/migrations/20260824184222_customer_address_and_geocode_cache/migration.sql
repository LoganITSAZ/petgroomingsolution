-- Customers had nowhere to record where they are, so nothing could be mapped.
ALTER TABLE "customers" ADD COLUMN "address" TEXT;

-- Addresses already placed on a map. Nominatim is keyless but rate-limited,
-- so a lookup is kept for good; null coordinates are a remembered miss.
CREATE TABLE "geocode_cache" (
    "query" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "label" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geocode_cache_pkey" PRIMARY KEY ("query")
);
