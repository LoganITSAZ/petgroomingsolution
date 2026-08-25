CREATE TYPE "ThemePreference" AS ENUM ('LIGHT', 'DARK');

ALTER TABLE "staff"
ADD COLUMN "themePreference" "ThemePreference" NOT NULL DEFAULT 'LIGHT';

ALTER TABLE "customers"
ADD COLUMN "themePreference" "ThemePreference" NOT NULL DEFAULT 'LIGHT';