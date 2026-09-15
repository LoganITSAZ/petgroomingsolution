-- Photographs of one day's work: before, after, and whatever somebody noticed.
CREATE TYPE "VisitPhotoKind" AS ENUM ('BEFORE', 'AFTER', 'ISSUE');

CREATE TABLE "visit_photos" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "kind" "VisitPhotoKind" NOT NULL,
    "caption" TEXT,
    "ownerVisible" BOOLEAN NOT NULL DEFAULT false,
    "takenById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "visit_photos_appointmentId_kind_idx" ON "visit_photos"("appointmentId", "kind");

ALTER TABLE "visit_photos" ADD CONSTRAINT "visit_photos_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Restrict, not cascade: deletePhotoIfUnused() is the only thing that frees bytes.
ALTER TABLE "visit_photos" ADD CONSTRAINT "visit_photos_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visit_photos" ADD CONSTRAINT "visit_photos_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- On by default: a shop that never uploads just sees an empty strip.
ALTER TABLE "system_config" ADD COLUMN "featureVisitPhotos" BOOLEAN NOT NULL DEFAULT true;
