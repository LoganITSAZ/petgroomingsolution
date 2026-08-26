-- A customer can approve several people, so the three columns become rows.
CREATE TABLE "alternate_contacts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alternate_contacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "alternate_contacts_customerId_idx" ON "alternate_contacts"("customerId");

ALTER TABLE "alternate_contacts" ADD CONSTRAINT "alternate_contacts_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry the alternate already on file across before the columns go.
INSERT INTO "alternate_contacts" ("id", "customerId", "name", "phone", "email")
SELECT gen_random_uuid()::text, "id", "altContactName", "altContactPhone", "altContactEmail"
FROM "customers"
WHERE "altContactName" IS NOT NULL AND "altContactName" <> '';

ALTER TABLE "customers"
    DROP COLUMN "altContactName",
    DROP COLUMN "altContactPhone",
    DROP COLUMN "altContactEmail";
