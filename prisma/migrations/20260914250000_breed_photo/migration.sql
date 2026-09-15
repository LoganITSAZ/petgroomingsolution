-- A stock photo of the breed, by URL. Breed guides are the shop's reference,
-- not a pet's record, so this is a link rather than a row in `photos`.
ALTER TABLE "breed_guides" ADD COLUMN "photoUrl" TEXT;
