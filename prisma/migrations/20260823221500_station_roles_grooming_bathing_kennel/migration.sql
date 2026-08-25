-- Station roles reduced to Grooming, Bathing and Kennels.
-- Existing rows are mapped: BATH -> BATHING, DRYING -> GROOMING.
ALTER TYPE "StationRole" RENAME TO "StationRole_old";

CREATE TYPE "StationRole" AS ENUM ('GROOMING', 'BATHING', 'KENNEL');

ALTER TABLE "stations" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "stations"
  ALTER COLUMN "role" TYPE "StationRole"
  USING (
    CASE "role"::text
      WHEN 'BATH' THEN 'BATHING'
      WHEN 'DRYING' THEN 'GROOMING'
      ELSE "role"::text
    END
  )::"StationRole";

ALTER TABLE "stations" ALTER COLUMN "role" SET DEFAULT 'GROOMING';

DROP TYPE "StationRole_old";
