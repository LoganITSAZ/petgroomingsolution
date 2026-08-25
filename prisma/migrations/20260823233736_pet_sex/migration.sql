-- CreateEnum
CREATE TYPE "PetSex" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- AlterTable
ALTER TABLE "pets" ADD COLUMN     "sex" "PetSex" NOT NULL DEFAULT 'UNKNOWN';
