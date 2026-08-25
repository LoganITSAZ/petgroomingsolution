/*
  Warnings:

  - Added the required column `serviceId` to the `promotions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "promotions" ADD COLUMN     "serviceId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "promotions_serviceId_idx" ON "promotions"("serviceId");

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
