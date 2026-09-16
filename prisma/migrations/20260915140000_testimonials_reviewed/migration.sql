-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "featureTestimonials" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "testimonials" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "rating" INTEGER;

-- Everything written before moderation existed was typed in by the shop, so
-- it is already approved.
UPDATE "testimonials" SET "approvedAt" = "createdAt";

-- CreateIndex
CREATE INDEX "testimonials_approvedAt_isActive_sortOrder_idx" ON "testimonials"("approvedAt", "isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
