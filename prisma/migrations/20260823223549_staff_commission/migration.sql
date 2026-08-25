-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "commissionPercent" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "defaultCommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 40;
