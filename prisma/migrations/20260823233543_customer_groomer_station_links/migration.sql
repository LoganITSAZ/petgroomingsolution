-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "preferredStaffId" TEXT;

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "defaultStationId" TEXT;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_defaultStationId_fkey" FOREIGN KEY ("defaultStationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_preferredStaffId_fkey" FOREIGN KEY ("preferredStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
