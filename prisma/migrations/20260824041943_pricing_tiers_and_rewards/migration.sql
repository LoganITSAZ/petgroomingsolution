-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('PERCENT', 'AMOUNT');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "pricingDiscountCents" INTEGER,
ADD COLUMN     "pricingTierId" TEXT;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "pricingNotes" TEXT,
ADD COLUMN     "pricingTierId" TEXT;

-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "featureRewards" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rewardLabel" TEXT NOT NULL DEFAULT 'A free nail trim',
ADD COLUMN     "rewardVisitsPerReward" INTEGER NOT NULL DEFAULT 8;

-- CreateTable
CREATE TABLE "pricing_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountKind" "DiscountKind" NOT NULL DEFAULT 'PERCENT',
    "discountPercent" DOUBLE PRECISION,
    "discountCents" INTEGER,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_earnings" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_redemptions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "staffId" TEXT,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_tiers_name_key" ON "pricing_tiers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "reward_earnings_appointmentId_key" ON "reward_earnings"("appointmentId");

-- CreateIndex
CREATE INDEX "reward_earnings_customerId_idx" ON "reward_earnings"("customerId");

-- CreateIndex
CREATE INDEX "reward_redemptions_customerId_idx" ON "reward_redemptions"("customerId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_pricingTierId_fkey" FOREIGN KEY ("pricingTierId") REFERENCES "pricing_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_pricingTierId_fkey" FOREIGN KEY ("pricingTierId") REFERENCES "pricing_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_earnings" ADD CONSTRAINT "reward_earnings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_earnings" ADD CONSTRAINT "reward_earnings_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
