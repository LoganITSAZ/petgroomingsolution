-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'SLOT_OFFER';

-- DropIndex
DROP INDEX "notification_logs_appointmentId_kind_key";

-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "digestHour" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "digestLastSentOn" TEXT,
ADD COLUMN     "featureDailyDigest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featureSlotOffers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slotOfferMaxRecipients" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "slotOfferWindowDays" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "insight_decisions" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "snoozedUntil" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insight_decisions_insightId_key" ON "insight_decisions"("insightId");

-- CreateIndex
CREATE INDEX "insight_decisions_snoozedUntil_idx" ON "insight_decisions"("snoozedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_appointmentId_customerId_kind_key" ON "notification_logs"("appointmentId", "customerId", "kind");

-- AddForeignKey
ALTER TABLE "insight_decisions" ADD CONSTRAINT "insight_decisions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

