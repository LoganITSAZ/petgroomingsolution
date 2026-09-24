-- The waiver becomes one of several documents a customer signs, and an
-- acceptance carries the signature that was drawn for it.
--
-- Nothing is lost: the waiver text and version on system_config become the first
-- shop_documents row, and every revision and acceptance already written is
-- pointed at it.

CREATE TYPE "ShopDocumentKind" AS ENUM ('WAIVER', 'MATTING_RELEASE', 'MEDICAL_CONSENT', 'OTHER');

CREATE TABLE "shop_documents" (
  "id" TEXT NOT NULL,
  "kind" "ShopDocumentKind" NOT NULL DEFAULT 'OTHER',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shop_documents_pkey" PRIMARY KEY ("id")
);

-- The waiver the shop already has. A shop that never wrote one still gets the
-- row, inactive, so the revisions and acceptances below have somewhere to point.
INSERT INTO "shop_documents" ("id", "kind", "title", "body", "version", "isActive", "sortOrder", "updatedAt")
SELECT
  'doc_waiver',
  'WAIVER',
  'Liability Waiver',
  COALESCE("waiverText", ''),
  COALESCE("waiverVersion", '1.0'),
  "waiverText" IS NOT NULL AND length(trim("waiverText")) > 0,
  0,
  CURRENT_TIMESTAMP
FROM "system_config"
WHERE "id" = 'global';

-- A deployment with no config row yet (nothing has booted) still needs the anchor.
INSERT INTO "shop_documents" ("id", "kind", "title", "body", "version", "isActive", "sortOrder", "updatedAt")
SELECT 'doc_waiver', 'WAIVER', 'Liability Waiver', '', '1.0', false, 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "shop_documents" WHERE "id" = 'doc_waiver');

-- Revisions: same rows, a document to belong to, and a version number that is
-- only unique within that document.
ALTER TABLE "waiver_revisions" RENAME TO "document_revisions";
ALTER TABLE "document_revisions" RENAME CONSTRAINT "waiver_revisions_pkey" TO "document_revisions_pkey";
ALTER INDEX "waiver_revisions_version_key" RENAME TO "document_revisions_version_key";
ALTER TABLE "document_revisions" RENAME CONSTRAINT "waiver_revisions_createdById_fkey" TO "document_revisions_createdById_fkey";
ALTER TABLE "document_revisions" ADD COLUMN "documentId" TEXT;
UPDATE "document_revisions" SET "documentId" = 'doc_waiver';
ALTER TABLE "document_revisions" ALTER COLUMN "documentId" SET NOT NULL;
DROP INDEX "document_revisions_version_key";
CREATE UNIQUE INDEX "document_revisions_documentId_version_key" ON "document_revisions"("documentId", "version");
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "shop_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Acceptances: the same, plus the signature.
ALTER TABLE "waiver_acceptances" RENAME TO "document_acceptances";
ALTER TABLE "document_acceptances" RENAME CONSTRAINT "waiver_acceptances_pkey" TO "document_acceptances_pkey";
ALTER TABLE "document_acceptances" RENAME CONSTRAINT "waiver_acceptances_customerId_fkey" TO "document_acceptances_customerId_fkey";
ALTER TABLE "document_acceptances" RENAME COLUMN "waiverVersion" TO "version";
ALTER INDEX "waiver_acceptances_customerId_waiverVersion_key" RENAME TO "document_acceptances_customerId_version_key";
ALTER TABLE "document_acceptances" ADD COLUMN "documentId" TEXT;
UPDATE "document_acceptances" SET "documentId" = 'doc_waiver';
ALTER TABLE "document_acceptances" ALTER COLUMN "documentId" SET NOT NULL;
ALTER TABLE "document_acceptances" ADD COLUMN "signedName" TEXT;
ALTER TABLE "document_acceptances" ADD COLUMN "signaturePhotoId" TEXT;
DROP INDEX "document_acceptances_customerId_version_key";
CREATE UNIQUE INDEX "document_acceptances_customerId_documentId_version_key"
  ON "document_acceptances"("customerId", "documentId", "version");
ALTER TABLE "document_acceptances" ADD CONSTRAINT "document_acceptances_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "shop_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_acceptances" ADD CONSTRAINT "document_acceptances_signaturePhotoId_fkey"
  FOREIGN KEY ("signaturePhotoId") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The text now lives on the document that carries it.
ALTER TABLE "system_config" DROP COLUMN "waiverText";
ALTER TABLE "system_config" DROP COLUMN "waiverVersion";
