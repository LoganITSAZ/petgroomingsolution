-- AlterEnum
ALTER TYPE "ThemePreference" ADD VALUE 'SYSTEM';

-- DropIndex
DROP INDEX "reward_redemptions_appointmentId_idx";
