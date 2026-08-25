-- Every existing appointment's single service becomes its first line item, so
-- multi-service visits and single-service visits read the same way.
INSERT INTO "appointment_services" ("id", "appointmentId", "serviceType", "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, a."id", a."serviceType", 0, a."createdAt"
FROM "appointments" a
ON CONFLICT ("appointmentId", "serviceType") DO NOTHING;
