-- Keep the tagline when populated; otherwise carry over the former banner.
UPDATE "system_config"
SET "shopTagline" = COALESCE(NULLIF(BTRIM("shopTagline"), ''), NULLIF(BTRIM("themeBannerText"), ''));

ALTER TABLE "system_config" DROP COLUMN "themeBannerText";
