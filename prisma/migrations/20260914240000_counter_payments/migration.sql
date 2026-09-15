-- Money at the counter: the fees a groomer finds on the table, and what was
-- actually paid on the shop's own terminal.
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'CASH', 'CHECK', 'OTHER');

CREATE TABLE "appointment_surcharges" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "surchargeId" TEXT,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "aboveRange" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_surcharges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "appointment_surcharges_appointmentId_idx" ON "appointment_surcharges"("appointmentId");

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "tipCents" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT,
    "note" TEXT,
    "takenById" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payments_appointmentId_idx" ON "payments"("appointmentId");
CREATE INDEX "payments_takenAt_idx" ON "payments"("takenAt");

ALTER TABLE "appointment_surcharges" ADD CONSTRAINT "appointment_surcharges_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_surcharges" ADD CONSTRAINT "appointment_surcharges_surchargeId_fkey" FOREIGN KEY ("surchargeId") REFERENCES "surcharges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointment_surcharges" ADD CONSTRAINT "appointment_surcharges_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "system_config" ADD COLUMN "featureCounterPayments" BOOLEAN NOT NULL DEFAULT true;
