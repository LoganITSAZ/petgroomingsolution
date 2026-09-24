-- CreateEnum
CREATE TYPE "PetSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'XL');

-- AlterTable
ALTER TABLE "appointment_services" ADD COLUMN     "sizeTier" "PetSize";

-- AlterTable
ALTER TABLE "breed_guides" ADD COLUMN     "typicalWeightLbs" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "sizeLargeMaxLbs" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "sizeMediumUnderLbs" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "sizeSmallUnderLbs" INTEGER NOT NULL DEFAULT 15;

