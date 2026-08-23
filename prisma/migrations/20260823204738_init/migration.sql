-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'GROOMER');

-- CreateEnum
CREATE TYPE "Species" AS ENUM ('DOG', 'CAT', 'OTHER');

-- CreateEnum
CREATE TYPE "CoatType" AS ENUM ('SHORT', 'MEDIUM', 'LONG', 'DOUBLE', 'CURLY', 'WIRE', 'HAIRLESS');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS', 'DRYING', 'FINISHING', 'COMPLETE', 'READY_PICKUP', 'PICKED_UP', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('BATH_AND_TIDY', 'BATH_AND_TRIM', 'FULL_GROOM', 'LION_CUT', 'NAIL_TRIM', 'NAIL_GRIND', 'EAR_CLEANING', 'TEETH_BRUSHING', 'GLAND_EXPRESSION', 'ADD_ON', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('APPOINTMENT', 'WALK_IN');

-- CreateEnum
CREATE TYPE "VisitEventType" AS ENUM ('REWASH', 'BITE', 'BEHAVIORAL', 'INJURY', 'MATTING_FOUND', 'EQUIPMENT_ISSUE', 'OTHER');

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "shopName" TEXT NOT NULL DEFAULT 'Gentle Groomer',
    "shopPhone" TEXT,
    "shopEmail" TEXT,
    "shopAddress" TEXT,
    "shopWebsite" TEXT,
    "featureOnlineBooking" BOOLEAN NOT NULL DEFAULT true,
    "featureWalkInPortal" BOOLEAN NOT NULL DEFAULT true,
    "featureEmailNotify" BOOLEAN NOT NULL DEFAULT true,
    "featureSmsNotify" BOOLEAN NOT NULL DEFAULT false,
    "featureWaiverRequired" BOOLEAN NOT NULL DEFAULT true,
    "waiverText" TEXT,
    "waiverVersion" TEXT,
    "businessHours" JSONB,
    "emailFromName" TEXT,
    "emailFromAddress" TEXT,
    "twilioAccountSid" TEXT,
    "twilioAuthToken" TEXT,
    "twilioFromNumber" TEXT,
    "bookingLeadHours" INTEGER NOT NULL DEFAULT 2,
    "bookingWindowDays" INTEGER NOT NULL DEFAULT 30,
    "walkInWindowStart" TEXT NOT NULL DEFAULT '09:00',
    "walkInWindowEnd" TEXT NOT NULL DEFAULT '15:00',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'GROOMER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pets" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" "Species" NOT NULL DEFAULT 'DOG',
    "breed" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "weightLbs" DOUBLE PRECISION,
    "coatType" "CoatType",
    "temperamentNotes" TEXT,
    "healthFlags" TEXT[],
    "groomingNotes" TEXT,
    "hasBiteHistory" BOOLEAN NOT NULL DEFAULT false,
    "photoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "stationId" TEXT,
    "staffId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "appointmentType" "AppointmentType" NOT NULL DEFAULT 'APPOINTMENT',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "serviceType" "ServiceType" NOT NULL,
    "durationMins" INTEGER,
    "visitNotes" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiver_acceptances" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "waiverVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "waiver_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_events" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "eventType" "VisitEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loggedById" TEXT,
    "note" TEXT,

    CONSTRAINT "visit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_status_history" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" TEXT,
    "note" TEXT,

    CONSTRAINT "appointment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "waiver_acceptances_customerId_waiverVersion_key" ON "waiver_acceptances"("customerId", "waiverVersion");

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_acceptances" ADD CONSTRAINT "waiver_acceptances_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
