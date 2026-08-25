-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "lateArrivalLateMins" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "lateArrivalMissedMins" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "lateArrivalWatchMins" INTEGER NOT NULL DEFAULT 5;
