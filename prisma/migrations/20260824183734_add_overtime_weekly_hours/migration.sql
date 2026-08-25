-- The week past which scheduled hours read as overtime on the rota. Federal
-- FLSA overtime is 40 hours; the shop can set its own.
ALTER TABLE "system_config" ADD COLUMN "overtimeWeeklyHours" INTEGER NOT NULL DEFAULT 40;
