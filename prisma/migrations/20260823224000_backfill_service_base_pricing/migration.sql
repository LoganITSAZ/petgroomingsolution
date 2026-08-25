-- Existing size-priced services keep their published prices: the small price
-- becomes the base and each larger size keeps its current ratio to it, so
-- switching a service to base pricing changes nothing until the base moves.
UPDATE "services"
SET
  "pricingMode" = 'BASE',
  "basePriceCents" = "priceSmallCents",
  "mediumMultiplier" = COALESCE(ROUND(("priceMediumCents"::numeric / "priceSmallCents"), 4), 1.33),
  "largeMultiplier"  = COALESCE(ROUND(("priceLargeCents"::numeric  / "priceSmallCents"), 4), 1.87),
  "xlMultiplier"     = COALESCE(ROUND(("priceXlCents"::numeric     / "priceSmallCents"), 4), 2.53)
WHERE "priceSmallCents" IS NOT NULL AND "priceSmallCents" > 0;
