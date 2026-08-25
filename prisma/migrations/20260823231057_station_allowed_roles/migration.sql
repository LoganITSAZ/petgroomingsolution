-- AlterTable
ALTER TABLE "stations" ADD COLUMN     "allowedRoles" "StaffRole"[] DEFAULT ARRAY[]::"StaffRole"[];
