-- CreateEnum
CREATE TYPE "PasswordResetSubject" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "subject" "PasswordResetSubject" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_tokenHash_key" ON "password_resets"("tokenHash");

-- CreateIndex
CREATE INDEX "password_resets_subject_subjectId_idx" ON "password_resets"("subject", "subjectId");

-- CreateIndex
CREATE INDEX "password_resets_expiresAt_idx" ON "password_resets"("expiresAt");
