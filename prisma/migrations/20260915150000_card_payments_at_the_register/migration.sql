-- AlterEnum
ALTER TYPE "StationRole" ADD VALUE 'REGISTER';

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'CLOVER');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "paymentProvider" "PaymentProvider";

-- AlterTable
ALTER TABLE "stations" ADD COLUMN     "readerRef" TEXT,
ADD COLUMN     "readerLivemode" BOOLEAN;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "provider" "PaymentProvider";

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "stationId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "providerRef" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "paymentId" TEXT,
    "startedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_providerRef_key" ON "payment_attempts"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_idempotencyKey_key" ON "payment_attempts"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_paymentId_key" ON "payment_attempts"("paymentId");

-- CreateIndex
CREATE INDEX "payment_attempts_appointmentId_idx" ON "payment_attempts"("appointmentId");

-- CreateIndex
CREATE INDEX "payment_attempts_status_createdAt_idx" ON "payment_attempts"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
