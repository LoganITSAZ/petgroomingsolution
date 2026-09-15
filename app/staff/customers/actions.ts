"use server";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guards";
import { z } from "zod";
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
      photoId: customerPhoto && "id" in customerPhoto ? customerPhoto.id : null,
      // No password means no portal sign-in: store an unusable random hash
      // rather than something guessable.
      passwordHash: await bcrypt.hash(password || randomBytes(32).toString("hex"), 12),
      ...(field("altContactName")
        ? {
            alternateContacts: {
              create: {
                name: field("altContactName"),
                phone: field("altContactPhone") || null,
                email: field("altContactEmail").toLowerCase() || null,
              },
            },
          }
        : {}),
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

/** Edit the customer's identity and contact details. */
export async function saveCustomerProfile(formData: FormData): Promise<void> {
  await requireStaff();
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const customerId = field("customerId");
  if (!customerId) redirect("/staff/customers?error=not_found");
  const path = `/staff/customers/${customerId}`;
  const firstName = field("firstName");
  const lastName = field("lastName");
  const email = field("email").toLowerCase();
  if (!firstName || !lastName || !z.string().email().safeParse(email).success) {
    redirect(`${path}?error=profile_invalid`);
  }
  try {
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        firstName,
        lastName,
        email,
        phone: field("phone") || null,
        address: field("address") || null,
        // Reads as an opt-*in* on the form and is stored as an opt-out, same as
        // the customer's own portal. The marker says the form carried it at all,
        // because an unchecked box posts nothing.
        ...(formData.get("smsPrefPosted") !== null && {
          smsOptOut: formData.get("smsNotify") === null,
        }),
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      redirect(`${path}?error=email_taken`);
    }
    throw error;
  }
  revalidatePath("/staff/customers");
  revalidatePath(path);
  revalidatePath("/staff/pets/[id]", "page");
  revalidatePath("/portal/profile");
  redirect(`${path}?updated=1`);
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

/**
 * Add or edit one of the people approved to drop off or collect.
 *
 * One action for both, same as `savePet`: an `alternateId` means editing.
 */
export async function saveAlternateContact(formData: FormData): Promise<void> {
  await requireStaff();

  const field = (name: string) => ((formData.get(name) as string | null) ?? "").trim();
  const customerId = field("customerId");
  const alternateId = field("alternateId");
  const name = field("name");

  if (!customerId) redirect("/staff/customers?error=not_found");
  if (!name) redirect(`/staff/customers/${customerId}?error=alt_name`);

  const email = field("email").toLowerCase();
  if (email && !email.includes("@")) {
    redirect(`/staff/customers/${customerId}?error=alt_email`);
  }

  const data = { name, phone: field("phone") || null, email: email || null };

  if (alternateId) {
    // Scoped to the owner so a stray id cannot edit someone else's list.
    await prisma.alternateContact.updateMany({ where: { id: alternateId, customerId }, data });
  } else {
    await prisma.alternateContact.create({ data: { ...data, customerId } });
  }

  revalidatePath(`/staff/customers/${customerId}`);
  redirect(`/staff/customers/${customerId}?alt=1`);
}

/** Withdraw approval from one person. */
export async function removeAlternateContact(formData: FormData): Promise<void> {
  await requireStaff();

  const customerId = ((formData.get("customerId") as string | null) ?? "").trim();
  const alternateId = ((formData.get("alternateId") as string | null) ?? "").trim();
  if (!customerId || !alternateId) redirect("/staff/customers?error=not_found");

  await prisma.alternateContact.deleteMany({ where: { id: alternateId, customerId } });

  revalidatePath(`/staff/customers/${customerId}`);
  redirect(`/staff/customers/${customerId}?alt_removed=1`);
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
  // Optional: applying the reward to an open visit takes it off that bill
  // instead of handing it over at the counter.
  const appointmentId = ((formData.get("appointmentId") as string | null) ?? "").trim();
  if (!customerId) redirect("/staff/customers?error=not_found");

  const result = await redeemReward({
    customerId,
    staffId,
    note,
    appointmentId: appointmentId || null,
  });

  revalidatePath(`/staff/customers/${customerId}`);
  revalidatePath("/portal");
  // Applying a reward to a bill is done from the visit, so that is where the
  // person doing it is looking when it lands.
  if (appointmentId) {
    revalidatePath(`/staff/appointments/${appointmentId}`);
    redirect(
      result.ok
        ? `/staff/appointments/${appointmentId}?redeemed=1`
        : `/staff/appointments/${appointmentId}?error=redeem_failed`
    );
  }
  redirect(
    result.ok
      ? `/staff/customers/${customerId}?redeemed=1`
      : `/staff/customers/${customerId}?error=redeem_failed`
  );
}

/**
 * Add or edit a pet from the owner's profile.
 *
 * One action for both: the modal posts a `petId` when it is editing and
 * nothing when it is adding, which is the only difference between the two.
 */
export async function savePet(formData: FormData): Promise<void> {
  await requireStaff();

  const field = (name: string) => ((formData.get(name) as string | null) ?? "").trim();
  const customerId = field("customerId");
  const petId = field("petId");
  const name = field("name");
  const returnPath = petId && field("returnToPet") === "1"
    ? `/staff/pets/${petId}`
    : `/staff/customers/${customerId}`;

  if (!customerId) redirect("/staff/customers?error=not_found");
  if (!name) redirect(`${returnPath}?error=pet_name`);

  const weightRaw = field("weightLbs");
  const weightLbs = weightRaw ? Number(weightRaw) : null;
  if (weightLbs != null && (!Number.isFinite(weightLbs) || weightLbs <= 0)) {
    redirect(`${returnPath}?error=bad_weight`);
  }

  /*
   * Confirming vaccinations stamps the day it was confirmed; unticking it
   * clears the stamp. The original date is read back rather than posted, so
   * an ordinary save of some other field does not re-date the check.
   */
  const existing = petId
    ? await prisma.pet.findFirst({
        where: { id: petId, customerId },
        select: { vaccinationsConfirmedAt: true },
      })
    : null;
  const vaccinationsConfirmedAt = formData.get("vaccinationsConfirmed")
    ? existing?.vaccinationsConfirmedAt ?? new Date()
    : null;

  const speciesRaw = field("species");
  const coatRaw = field("coatType");
  const data = {
    name,
    species: Object.values(Species).includes(speciesRaw as Species)
      ? (speciesRaw as Species)
      : Species.DOG,
    breed: field("breed") || null,
    weightLbs,
    coatType: Object.values(CoatType).includes(coatRaw as CoatType) ? (coatRaw as CoatType) : null,
    groomingNotes: field("groomingNotes") || null,
    temperamentNotes: field("temperamentNotes") || null,
    vetName: field("vetName") || null,
    vetPhone: field("vetPhone") || null,
    vaccinationsConfirmedAt,
    // One chip per value, posted under the same name by TagPicker.
    healthFlags: [
      ...new Set(
        formData
          .getAll("healthFlags")
          .map((flag) => flag.toString().trim())
          .filter(Boolean)
      ),
    ],
  };

  if (petId) {
    // Scoped to the owner so a stray id cannot edit somebody else's pet.
    await prisma.pet.updateMany({ where: { id: petId, customerId }, data });
  } else {
    await prisma.pet.create({ data: { ...data, customerId } });
  }

  revalidatePath(`/staff/customers/${customerId}`);
  if (petId) revalidatePath(`/staff/pets/${petId}`);
  revalidatePath("/staff/customers");
  redirect(`${returnPath}?${returnPath.startsWith("/staff/pets/") ? "updated" : "pet"}=1`);
}

/**
 * Take a pet off the profile.
 *
 * Deactivated, never deleted: its visits are the shop's history and the pet
 * may come back. Every list already filters on `isActive`.
 */
export async function removePet(formData: FormData): Promise<void> {
  await requireStaff();

  const customerId = ((formData.get("customerId") as string | null) ?? "").trim();
  const petId = ((formData.get("petId") as string | null) ?? "").trim();
  if (!customerId || !petId) redirect("/staff/customers?error=not_found");

  await prisma.pet.updateMany({ where: { id: petId, customerId }, data: { isActive: false } });

  revalidatePath(`/staff/customers/${customerId}`);
  redirect(`/staff/customers/${customerId}?pet_removed=1`);
}
