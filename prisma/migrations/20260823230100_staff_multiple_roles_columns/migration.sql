-- Second half of the multi-role change: Postgres cannot use a newly added enum
-- value in the same transaction that added it, so the column work lands here.
ALTER TABLE "staff" ADD COLUMN "roles" "StaffRole"[] DEFAULT ARRAY['GROOMER']::"StaffRole"[];

UPDATE "staff" SET "roles" = ARRAY["role"]::"StaffRole"[];

ALTER TABLE "staff" ALTER COLUMN "roles" SET NOT NULL;

ALTER TABLE "staff" DROP COLUMN "role";
