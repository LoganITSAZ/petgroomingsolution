-- A station's name is what the touchscreen shows: one field, not two.
ALTER TABLE "stations" DROP COLUMN "displayLabel";
