"use server";

import { prisma } from "@/lib/prisma";
import { requireFeature, requireStaff } from "@/lib/auth-guards";
import { shopMoment } from "@/lib/shop-time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Record or renew one vaccination for one pet.
 *
 * There is one row per pet per requirement, updated in place: the shop's
 * question is always "is this pet current", and an archive of every expired
 * certificate is a records-retention system this app is not.
 */
export async function recordVaccination(formData: FormData): Promise<void> {
  const staffId = await requireStaff();
  await requireFeature("featureVaccinationGate");

  const petId = ((formData.get("petId") as string | null) ?? "").trim();
  const requirementId = ((formData.get("requirementId") as string | null) ?? "").trim();
  if (!petId || !requirementId) redirect("/staff");

  // An expiry is a date off a certificate, so it is stored at midday shop time
  // rather than midnight anywhere — see `dayDiff()` in lib/vaccinations.ts.
  const expiresRaw = ((formData.get("expiresOn") as string | null) ?? "").trim();
  const expiresOn = /^\d{4}-\d{2}-\d{2}$/.test(expiresRaw)
    ? shopMoment(expiresRaw, "12:00")
    : null;
  const note = ((formData.get("note") as string | null) ?? "").trim() || null;

  await prisma.petVaccination.upsert({
    where: { petId_requirementId: { petId, requirementId } },
    create: { petId, requirementId, expiresOn, note, verifiedById: staffId },
    update: { expiresOn, note, verifiedAt: new Date(), verifiedById: staffId },
  });

  revalidatePath(`/staff/pets/${petId}`);
  redirect(`/staff/pets/${petId}?vaccination=1`);
}
