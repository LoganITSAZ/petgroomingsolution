-- CreateEnum
CREATE TYPE "StaffPresence" AS ENUM ('OFF_SHIFT', 'READY', 'BREAK', 'RESTROOM');

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "presence" "StaffPresence" NOT NULL DEFAULT 'OFF_SHIFT',
ADD COLUMN     "presenceSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "staff_presence_events" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "presence" "StaffPresence" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "staff_presence_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_presence_events_staffId_changedAt_idx" ON "staff_presence_events"("staffId", "changedAt");

-- AddForeignKey
ALTER TABLE "staff_presence_events" ADD CONSTRAINT "staff_presence_events_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
