-- Broad, shop-facing categories. The narrow ServiceType stays for reporting
-- and is derived from the category when a service is saved.
CREATE TYPE "ServiceCategory" AS ENUM ('GROOM', 'BATH', 'NAILS', 'DENTAL', 'EARS', 'ADD_ON', 'OTHER');

ALTER TABLE "services" ADD COLUMN "category" "ServiceCategory" NOT NULL DEFAULT 'GROOM';

UPDATE "services" SET "category" = CASE "type"::text
  WHEN 'FULL_GROOM'       THEN 'GROOM'
  WHEN 'LION_CUT'         THEN 'GROOM'
  WHEN 'BATH_AND_TIDY'    THEN 'BATH'
  WHEN 'BATH_AND_TRIM'    THEN 'BATH'
  WHEN 'NAIL_TRIM'        THEN 'NAILS'
  WHEN 'NAIL_GRIND'       THEN 'NAILS'
  WHEN 'TEETH_BRUSHING'   THEN 'DENTAL'
  WHEN 'EAR_CLEANING'     THEN 'EARS'
  WHEN 'GLAND_EXPRESSION' THEN 'ADD_ON'
  WHEN 'ADD_ON'           THEN 'ADD_ON'
  ELSE 'OTHER'
END::"ServiceCategory";

-- A visit can hold two services that share a narrow type (a dog groom and a
-- cat groom are both FULL_GROOM), so the line item's identity is the catalog
-- row, not the type.
ALTER TABLE "appointment_services" DROP CONSTRAINT IF EXISTS "appointment_services_appointmentId_serviceType_key";
DROP INDEX IF EXISTS "appointment_services_appointmentId_serviceType_key";

CREATE UNIQUE INDEX "appointment_services_appointmentId_serviceId_key"
  ON "appointment_services"("appointmentId", "serviceId");

CREATE INDEX "appointment_services_serviceType_idx" ON "appointment_services"("serviceType");
