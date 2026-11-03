-- A booking used to claim the preferred groomer's home station. It no longer
-- does: a pet is placed when it arrives. Bookings still in the future let go
-- of the station they were given, so they arrive to a kennel like any other.
UPDATE "appointments" SET "stationId" = NULL WHERE "status" = 'SCHEDULED' AND "stationId" IS NOT NULL;
