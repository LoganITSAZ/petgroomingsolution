-- CreateTable
CREATE TABLE "breed_guides" (
    "id" TEXT NOT NULL,
    "breed" TEXT NOT NULL,
    "species" "Species" NOT NULL DEFAULT 'DOG',
    "coat" "CoatType",
    "summary" TEXT NOT NULL,
    "tips" TEXT NOT NULL,
    "typicalMins" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breed_guides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "breed_guides_breed_key" ON "breed_guides"("breed");
