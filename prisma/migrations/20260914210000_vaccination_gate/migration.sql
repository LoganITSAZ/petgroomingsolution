-- Vaccination gate: what the shop requires, and what it has seen per pet.

CREATE TABLE "vaccine_requirements" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" "Species" NOT NULL DEFAULT 'DOG',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccine_requirements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vaccine_requirements_name_species_key" ON "vaccine_requirements"("name", "species");

CREATE TABLE "pet_vaccinations" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "expiresOn" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "note" TEXT,

    CONSTRAINT "pet_vaccinations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pet_vaccinations_expiresOn_idx" ON "pet_vaccinations"("expiresOn");
CREATE UNIQUE INDEX "pet_vaccinations_petId_requirementId_key" ON "pet_vaccinations"("petId", "requirementId");

ALTER TABLE "pet_vaccinations" ADD CONSTRAINT "pet_vaccinations_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pet_vaccinations" ADD CONSTRAINT "pet_vaccinations_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "vaccine_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pet_vaccinations" ADD CONSTRAINT "pet_vaccinations_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "system_config" ADD COLUMN "featureVaccinationGate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "system_config" ADD COLUMN "vaccinationGateBlocks" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "system_config" ADD COLUMN "vaccinationGraceDays" INTEGER NOT NULL DEFAULT 0;
