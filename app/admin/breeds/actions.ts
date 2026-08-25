"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guards";
import { CoatType, Species } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function done(params: string): never {
  revalidatePath("/admin/breeds");
  revalidatePath("/staff/stations");
  redirect(`/admin/breeds${params}`);
}

/** Add or update one breed's reference card. */
export async function saveBreedGuide(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = ((formData.get("id") as string | null) ?? "").trim();
  const breed = ((formData.get("breed") as string | null) ?? "").trim();
  const summary = ((formData.get("summary") as string | null) ?? "").trim();
  const tips = ((formData.get("tips") as string | null) ?? "").trim();

  if (!breed) done("?error=breed_required");
  if (!summary) done("?error=summary_required");

  const speciesRaw = ((formData.get("species") as string | null) ?? "").trim();
  const coatRaw = ((formData.get("coat") as string | null) ?? "").trim();
  const minsRaw = ((formData.get("typicalMins") as string | null) ?? "").trim();
  const typicalMins = minsRaw ? Number(minsRaw) : null;
  if (typicalMins != null && (!Number.isInteger(typicalMins) || typicalMins <= 0)) {
    done("?error=bad_minutes");
  }

  const data = {
    breed,
    summary,
    tips,
    species: Object.values(Species).includes(speciesRaw as Species)
      ? (speciesRaw as Species)
      : Species.DOG,
    coat: Object.values(CoatType).includes(coatRaw as CoatType) ? (coatRaw as CoatType) : null,
    typicalMins,
  };

  const clash = await prisma.breedGuide.findUnique({ where: { breed } });
  if (clash && clash.id !== id) done("?error=duplicate");

  if (id) {
    await prisma.breedGuide.update({ where: { id }, data });
  } else {
    await prisma.breedGuide.create({ data });
  }

  done(`?saved=${encodeURIComponent(breed)}`);
}

export async function deleteBreedGuide(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = (formData.get("id") as string | null) ?? "";
  await prisma.breedGuide.delete({ where: { id } });
  done("?deleted=1");
}
