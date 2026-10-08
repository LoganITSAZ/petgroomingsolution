-- A complaint and a counter fix are logged on the visit they are about.
ALTER TYPE "VisitEventType" ADD VALUE 'COMPLAINT';
ALTER TYPE "VisitEventType" ADD VALUE 'REDO';

-- A redo that takes a slot points at the visit it redoes.
ALTER TABLE "appointments" ADD COLUMN "redoOfId" TEXT;
CREATE INDEX "appointments_redoOfId_idx" ON "appointments"("redoOfId");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_redoOfId_fkey"
  FOREIGN KEY ("redoOfId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
