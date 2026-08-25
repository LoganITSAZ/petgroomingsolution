"use server";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guards";
import { CoatType, Species } from "@prisma/client";
import bcrypt from "bcryptjs";
import { storePhoto, deletePhotoIfUnused } from "@/lib/photos";
import { randomBytes } from "crypto";
import { redeemReward } from "@/lib/rewards";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Staff register customers at the counter. A portal password is optional: with
 * none, the account exists for booking and history but cannot sign in online.
 */
export async function createCustomer(formData: FormData): Promise<void> {
  await requireStaff();

  const field = (name: string) => ((formData.get(name) as string | null) ?? "").trim();

  const firstName = field("firstName");
  const lastName = field("lastName");
  const email = field("email").toLowerCase();
  const password = field("password");

  if (!firstName || !lastName) redirect("/staff/customers/new?error=name_required");
  if (!email || !email.includes("@")) redirect("/staff/customers/new?error=email_required");
  if (password && password.length < 8) redirect("/staff/customers/new?error=weak_password");

  if (await prisma.customer.findUnique({ where: { email } })) {
    redirect("/staff/customers/new?error=email_taken");
  }

  // Photos are optional everywhere; a bad file is reported, never silently
  // dropped.
  const customerPhoto = await storePhoto(formData.get("photo"));
  if (customerPhoto && "error" in customerPhoto) {
    redirect(`/staff/customers/new?error=photo_${customerPhoto.error}`);
  }
  const petPhoto = await storePhoto(formData.get("petPhoto"));
  if (petPhoto && "error" in petPhoto) {
    redirect(`/staff/customers/new?error=photo_${petPhoto.error}`);
  }

  const petName = field("petName");
  const weightRaw = field("petWeightLbs");
  const weightLbs = weightRaw ? Number(weightRaw) : null;
  if (weightLbs != null && (!Number.isFinite(weightLbs) || weightLbs <= 0)) {
    redirect("/staff/customers/new?error=bad_weight");
  }

  const speciesRaw = field("petSpecies");
  const coatRaw = field("petCoatType");

  const customer = await prisma.customer.create({
    data: {
      firstName,
      lastName,
      email,
      phone: field("phone") || null,
      address: field("address") || null,
      preferredStaffId: field("preferredStaffId") || null,
      altContactName: field("altContactName") || null,
      altContactPhone: field("altContactPhone") || null,
      altContactEmail: field("altContactEmail") || null,
      photoId: customerPhoto && "id" in customerPhoto ? customerPhoto.id : null,
      // No password means no portal sign-in: store an unusable random hash
      // rather than something guessable.
      passwordHash: await bcrypt.hash(password || randomBytes(32).toString("hex"), 12),
      ...(petName
        ? {
            pets: {
              create: {
                name: petName,
                species: Object.values(Species).includes(speciesRaw as Species)
                  ? (speciesRaw as Species)
                  : Species.DOG,
                breed: field("petBreed") || null,
                weightLbs,
                coatType: Object.values(CoatType).includes(coatRaw as CoatType)
                  ? (coatRaw as CoatType)
                  : null,
                groomingNotes: field("petGroomingNotes") || null,
                photoId: petPhoto && "id" in petPhoto ? petPhoto.id : null,
              },
            },
          }
        : {}),
    },
  });

  revalidatePath("/staff/customers");
  redirect(`/staff/customers/${customer.id}?created=1`);
}

/** The groomer this customer books with; their station follows from it. */
export async function setPreferredGroomer(formData: FormData): Promise<void> {
  await requireStaff();

  const customerId = (formData.get("customerId") as string | null) ?? "";
  const staffId = ((formData.get("preferredStaffId") as string | null) ?? "").trim() || null;

  await prisma.customer.update({
    where: { id: customerId },
    data: { preferredStaffId: staffId },
  });

  revalidatePath(`/staff/customers/${customerId}`);
  redirect(`/staff/customers/${customerId}?groomer=1`);
}

/** Replace a customer's photo. Sending no file clears it. */
export async function setCustomerPhoto(formData: FormData): Promise<void> {
  await requireStaff();

  const customerId = (formData.get("customerId") as string | null) ?? "";
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { photoId: true },
  });
  if (!customer) redirect("/staff/customers?error=not_found");

  const uploaded = await storePhoto(formData.get("photo"));
  if (uploaded && "error" in uploaded) {
    redirect(`/staff/customers/${customerId}?error=photo_${uploaded.error}`);
  }

  const remove = formData.get("remove") === "1";
  if (!uploaded && !remove) redirect(`/staff/customers/${customerId}`);

  await prisma.customer.update({
    where: { id: customerId },
    data: { photoId: uploaded && "id" in uploaded ? uploaded.id : null },
  });
  await deletePhotoIfUnused(customer.photoId);

  revalidatePath(`/staff/customers/${customerId}`);
  redirect(`/staff/customers/${customerId}?photo=1`);
}

/** Replace a pet's photo. Sending no file clears it. */
export async function setPetPhoto(formData: FormData): Promise<void> {
  await requireStaff();

  const petId = (formData.get("petId") as string | null) ?? "";
  const pet = await prisma.pet.findUnique({ where: { id: petId }, select: { photoId: true } });
  if (!pet) redirect("/staff/customers?error=not_found");

  const uploaded = await storePhoto(formData.get("photo"));
  if (uploaded && "error" in uploaded) {
    redirect(`/staff/pets/${petId}?error=photo_${uploaded.error}`);
  }

  const remove = formData.get("remove") === "1";
  if (!uploaded && !remove) redirect(`/staff/pets/${petId}`);

  await prisma.pet.update({
    where: { id: petId },
    data: { photoId: uploaded && "id" in uploaded ? uploaded.id : null },
  });
  await deletePhotoIfUnused(pet.photoId);

  revalidatePath(`/staff/pets/${petId}`);
  redirect(`/staff/pets/${petId}?photo=1`);
}

/** The person the owner has approved to drop off or collect their pet. */
export async function setAlternateContact(formData: FormData): Promise<void> {
  await requireStaff();

  const customerId = (formData.get("customerId") as string | null) ?? "";
  const field = (name: string) => ((formData.get(name) as string | null) ?? "").trim();

  const email = field("altContactEmail").toLowerCase();
  if (email && !email.includes("@")) {
    redirect(`/staff/customers/${customerId}?error=alt_email`);
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      altContactName: field("altContactName") || null,
      altContactPhone: field("altContactPhone") || null,
      altContactEmail: email || null,
    },
  });

  revalidatePath(`/staff/customers/${customerId}`);
  redirect(`/staff/customers/${customerId}?alt=1`);
}

/** Where a customer is. Free text — the map is a lookup on top, not a format. */
export async function setCustomerAddress(formData: FormData): Promise<void> {
  await requireStaff();

  const customerId = (formData.get("customerId") as string | null) ?? "";
  const address = ((formData.get("address") as string | null) ?? "").trim();

  await prisma.customer.update({
    where: { id: customerId },
    data: { address: address || null },
  });

  revalidatePath(`/staff/customers/${customerId}`);
  redirect(`/staff/customers/${customerId}?address=1`);
}

/**
 * Put a customer on a rate, or back on list prices.
 *
 * Changing the rate does not touch visits already booked: their discount was
 * snapshotted when they were quoted. It applies from the next booking on.
 */
export async function setPricingTier(formData: FormData): Promise<void> {
  await requireStaff();

  const customerId = ((formData.get("customerId") as string | null) ?? "").trim();
  const raw = ((formData.get("pricingTierId") as string | null) ?? "").trim();
  const pricingNotes = ((formData.get("pricingNotes") as string | null) ?? "").trim();

  if (!customerId) redirect("/staff/customers?error=not_found");

  // An unknown id would otherwise throw on the foreign key.
  const pricingTierId = raw ? ((await prisma.pricingTier.findUnique({ where: { id: raw } }))?.id ?? null) : null;

  await prisma.customer.update({
    where: { id: customerId },
    data: { pricingTierId, pricingNotes: pricingNotes || null },
  });

  revalidatePath(`/staff/customers/${customerId}`);
  revalidatePath("/staff/customers");
  redirect(`/staff/customers/${customerId}?rate=1`);
}

/** Hand a reward over at the counter. */
export async function redeemCustomerReward(formData: FormData): Promise<void> {
  const staffId = await requireStaff();

  const customerId = ((formData.get("customerId") as string | null) ?? "").trim();
  const note = ((formData.get("note") as string | null) ?? "").trim();
  if (!customerId) redirect("/staff/customers?error=not_found");

  const result = await redeemReward({ customerId, staffId, note });

  revalidatePath(`/staff/customers/${customerId}`);
  revalidatePath("/portal");
  redirect(
    result.ok
      ? `/staff/customers/${customerId}?redeemed=1`
      : `/staff/customers/${customerId}?error=redeem_failed`
  );
}
