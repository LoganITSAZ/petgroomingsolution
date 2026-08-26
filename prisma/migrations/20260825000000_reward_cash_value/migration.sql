-- Rewards are counted in visits but paid out in money: one earned reward
-- takes a cash amount off a bill, which is the only thing that applies
-- cleanly to a visit carrying several services.
ALTER TABLE "system_config"
  ADD COLUMN "rewardValueCents" INTEGER NOT NULL DEFAULT 1000;

-- Snapshotted onto the visit, same rule as the negotiated rate beside it:
-- changing what a reward is worth must never reprice a quoted visit.
ALTER TABLE "appointments"
  ADD COLUMN "rewardDiscountCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "reward_redemptions"
  ADD COLUMN "valueCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "appointmentId" TEXT;

ALTER TABLE "reward_redemptions"
  ADD CONSTRAINT "reward_redemptions_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "reward_redemptions_appointmentId_idx" ON "reward_redemptions"("appointmentId");
