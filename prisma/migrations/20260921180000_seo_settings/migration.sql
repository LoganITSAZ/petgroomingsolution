-- Address in parts, so the business markup can carry a real PostalAddress.
ALTER TABLE "system_config" ADD COLUMN "shopCity" TEXT;
ALTER TABLE "system_config" ADD COLUMN "shopRegion" TEXT;
ALTER TABLE "system_config" ADD COLUMN "shopPostalCode" TEXT;

-- Search and sharing knobs, edited at /admin/marketing.
ALTER TABLE "system_config" ADD COLUMN "serviceAreaMiles" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "system_config" ADD COLUMN "seoGoogleVerification" TEXT;
ALTER TABLE "system_config" ADD COLUMN "seoKeywords" TEXT;
ALTER TABLE "system_config" ADD COLUMN "seoSocialTagline" TEXT;

-- Per-page overrides. No row means the derived copy.
CREATE TABLE "seo_pages" (
    "path" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "keywords" TEXT,
    "photoId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_pages_pkey" PRIMARY KEY ("path")
);

ALTER TABLE "seo_pages" ADD CONSTRAINT "seo_pages_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "faq_items" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faq_items_pkey" PRIMARY KEY ("id")
);
