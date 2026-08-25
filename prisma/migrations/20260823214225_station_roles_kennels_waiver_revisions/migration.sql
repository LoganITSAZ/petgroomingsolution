-- CreateEnum
CREATE TYPE "StationRole" AS ENUM ('GROOMING', 'BATH', 'DRYING', 'KENNEL');

-- AlterTable
ALTER TABLE "stations" ADD COLUMN     "kennelColumns" INTEGER,
ADD COLUMN     "kennelRows" INTEGER,
ADD COLUMN     "role" "StationRole" NOT NULL DEFAULT 'GROOMING';

-- CreateTable
CREATE TABLE "kennels" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "column" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appointmentId" TEXT,
    "occupiedAt" TIMESTAMP(3),

    CONSTRAINT "kennels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiver_revisions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "waiver_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kennels_appointmentId_key" ON "kennels"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "kennels_stationId_row_column_key" ON "kennels"("stationId", "row", "column");

-- CreateIndex
CREATE UNIQUE INDEX "kennels_stationId_label_key" ON "kennels"("stationId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "waiver_revisions_version_key" ON "waiver_revisions"("version");

-- AddForeignKey
ALTER TABLE "kennels" ADD CONSTRAINT "kennels_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kennels" ADD CONSTRAINT "kennels_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_revisions" ADD CONSTRAINT "waiver_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
