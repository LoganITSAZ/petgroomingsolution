-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "themeAutoSeasonal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "themeBannerText" TEXT,
ADD COLUMN     "themeBrandColor" TEXT,
ADD COLUMN     "themePreset" TEXT NOT NULL DEFAULT 'default';
