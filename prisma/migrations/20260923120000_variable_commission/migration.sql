-- Pay is a rate per service or per category, plus an hourly floor.
--
-- One percentage per groomer cannot say "60% on a full groom, 35% on a nail
-- trim". Exceptions are rows and the absence of a row is the fallback, so a
-- shop paying one rate has nothing to write and nothing changes for it.

ALTER TABLE "staff" ADD COLUMN "hourlyRateCents" INTEGER;

CREATE TABLE "staff_commission_rates" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "serviceId" TEXT,
  "category" "ServiceCategory",
  "percent" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_commission_rates_pkey" PRIMARY KEY ("id")
);

-- Postgres counts NULLs as distinct, so these two do not collide: a per-service
-- row has a null category and a per-category row a null service.
CREATE UNIQUE INDEX "staff_commission_rates_staffId_serviceId_key"
  ON "staff_commission_rates"("staffId", "serviceId");
CREATE UNIQUE INDEX "staff_commission_rates_staffId_category_key"
  ON "staff_commission_rates"("staffId", "category");

ALTER TABLE "staff_commission_rates" ADD CONSTRAINT "staff_commission_rates_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_commission_rates" ADD CONSTRAINT "staff_commission_rates_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
