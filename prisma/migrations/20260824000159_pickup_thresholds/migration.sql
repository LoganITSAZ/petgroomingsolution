-- DropIndex
DROP INDEX "appointments_kennelId_idx";

-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "pickupCriticalMins" INTEGER NOT NULL DEFAULT 240,
ADD COLUMN     "pickupLateMins" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "pickupWatchMins" INTEGER NOT NULL DEFAULT 60;
