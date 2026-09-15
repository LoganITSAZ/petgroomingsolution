-- Scheduled jobs write here so a runner that restarts never says the same
-- thing twice. One row per kind per visit.
CREATE TYPE "NotificationKind" AS ENUM ('APPOINTMENT_REMINDER');

CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "channels" TEXT[],
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_logs_appointmentId_kind_key" ON "notification_logs"("appointmentId", "kind");
CREATE INDEX "notification_logs_customerId_sentAt_idx" ON "notification_logs"("customerId", "sentAt");

ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "system_config" ADD COLUMN "featureAppointmentReminders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "system_config" ADD COLUMN "reminderHoursBefore" INTEGER NOT NULL DEFAULT 24;
