ALTER TABLE "system_config"
ADD COLUMN "contactFormEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "contactRecipient" TEXT,
ADD COLUMN "contactRequirePhone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "contactSuccessMessage" TEXT NOT NULL DEFAULT 'Thanks for reaching out! We will get back to you soon.';
