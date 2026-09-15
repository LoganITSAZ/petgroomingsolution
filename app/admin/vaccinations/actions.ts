"use server";

import { prisma } from "@/lib/prisma";
import { requireFeature, requireManager } from "@/lib/auth-guards";
import { Species } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function done(params: string): never {
  revalidatePath("/admin/vaccinations");
  revalidatePath("/staff/pets");
  redirect(`/admin/vaccinations${params}`);
}

/**
 * Add or rename one thing the shop checks.
 *
 * A server action is its own endpoint, so both the role and the feature are
 * re-checked here — the page's own redirect is presentation.
 */
export async function saveRequirement(formData: FormData): Promise<void> {
  await requireManager();
  await requireFeature("featureVaccinationGate");

  const id = ((formData.get("id") as string | null) ?? "").trim();
  const name = ((formData.get("name") as string | null) ?? "").trim();
  if (!name) done("?error=name_required");

  const speciesRaw = ((formData.get("species") as string | null) ?? "").trim();
  // Object.hasOwn, never `in`: "toString" is not a species.
  const species = Object.hasOwn(Species, speciesRaw)
    ? (speciesRaw as Species)
    : Species.DOG;
  const sortRaw = ((formData.get("sortOrder") as string | null) ?? "").trim();
  const sortOrder = Number.isInteger(Number(sortRaw)) ? Number(sortRaw) : 0;

  const clash = await prisma.vaccineRequirement.findUnique({
    where: { name_species: { name, species } },
  });
  if (clash && clash.id !== id) done("?error=duplicate");

  if (id) {
    await prisma.vaccineRequirement.update({ where: { id }, data: { name, species, sortOrder } });
  } else {
    await prisma.vaccineRequirement.create({ data: { name, species, sortOrder } });
  }
  done(`?saved=${encodeURIComponent(name)}`);
}

/**
 * Retire or restore a requirement.
 *
 * Retiring rather than deleting is the point: the records already on file stay
 * readable, and a shop that stops checking something can start again without
 * asking every owner for a certificate twice.
 */
export async function setRequirementActive(formData: FormData): Promise<void> {
  await requireManager();
  await requireFeature("featureVaccinationGate");

  const id = (formData.get("id") as string | null) ?? "";
  const isActive = formData.get("isActive") === "on";
  await prisma.vaccineRequirement.update({ where: { id }, data: { isActive } });
  done(isActive ? "?restored=1" : "?retired=1");
}
