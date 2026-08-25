-- CreateIndex
CREATE INDEX "appointments_scheduledAt_status_idx" ON "appointments"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "appointments_stationId_status_idx" ON "appointments"("stationId", "status");
