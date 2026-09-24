-- One-time fill of the seeded guides that existed before typicalWeightLbs did.
-- The seed only sets a weight on create, so a figure the shop later blanks stays blank.
UPDATE "breed_guides" SET "typicalWeightLbs" = v.lbs
FROM (VALUES
  ('Golden Retriever', 65),
  ('German Shepherd', 75),
  ('Shih Tzu', 12),
  ('Yorkshire Terrier', 6),
  ('Labrador Retriever', 65),
  ('Australian Shepherd', 50),
  ('Maltese', 7)
) AS v(breed, lbs)
WHERE "breed_guides"."breed" = v.breed AND "breed_guides"."typicalWeightLbs" IS NULL;
