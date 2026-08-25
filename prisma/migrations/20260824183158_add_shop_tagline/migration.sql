-- The tagline under the shop name on the public home page. It was hardcoded in
-- the hero; existing shops keep the wording they were already showing rather
-- than losing the line on deploy.
ALTER TABLE "system_config" ADD COLUMN "shopTagline" TEXT;

UPDATE "system_config"
SET "shopTagline" = 'The best and bubbliest groomer in town'
WHERE "shopTagline" IS NULL;
