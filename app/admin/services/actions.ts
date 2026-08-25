"use server";

import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import {
  parseDollarsToCents,
  roundToStep,
  tiersFromBase,
  typeForCategory,
} from "@/lib/pricing";
import { PricingMode, ServiceCategory, ServiceType, Species } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function done(params: string): never {
  revalidatePath("/admin/services");
  revalidatePath("/staff/services");
  revalidatePath("/services");
  redirect(`/admin/services${params}`);
}

interface ServiceInput {
  name: string;
  staffNotes: string | null;
  category: ServiceCategory;
  type: ServiceType;
  species: Species | null;
  description: string | null;
  priceSmallCents: number | null;
  priceMediumCents: number | null;
  priceLargeCents: number | null;
  priceXlCents: number | null;
  priceFlatCents: number | null;
  priceMaxCents: number | null;
  pricingMode: PricingMode;
  basePriceCents: number | null;
  mediumMultiplier: number;
  largeMultiplier: number;
  xlMultiplier: number;
  durationMins: number | null;
  walkInEligible: boolean;
  isActive: boolean;
  sortOrder: number;
}

function parseService(formData: FormData): ServiceInput | { error: string } {
  const name = ((formData.get("name") as string | null) ?? "").trim();
  const categoryRaw = (formData.get("category") as string | null) ?? "";
  const speciesRaw = ((formData.get("species") as string | null) ?? "").trim();

  if (!name) return { error: "name_required" };
  if (!Object.values(ServiceCategory).includes(categoryRaw as ServiceCategory)) {
    return { error: "invalid_type" };
  }
  const category = categoryRaw as ServiceCategory;
  if (speciesRaw && !Object.values(Species).includes(speciesRaw as Species)) {
    return { error: "invalid_species" };
  }

  const durationRaw = ((formData.get("durationMins") as string | null) ?? "").trim();
  const duration = durationRaw ? Number(durationRaw) : null;
  if (duration != null && (!Number.isInteger(duration) || duration <= 0)) {
    return { error: "invalid_duration" };
  }

  const sortRaw = ((formData.get("sortOrder") as string | null) ?? "").trim();
  const sortOrder = sortRaw ? Number(sortRaw) : 0;
  if (!Number.isFinite(sortOrder)) return { error: "invalid_sort" };

  // Base pricing derives the size ladder; manual pricing takes the four
  // typed-in prices as they are.
  const pricingMode =
    formData.get("pricingMode") === PricingMode.BASE ? PricingMode.BASE : PricingMode.MANUAL;
  const basePriceCents = parseDollarsToCents(formData.get("basePrice"));
  const multiplier = (field: string, fallback: number) => {
    const raw = ((formData.get(field) as string | null) ?? "").trim();
    const parsed = raw ? Number(raw) : fallback;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const mediumMultiplier = multiplier("mediumMultiplier", 1.33);
  const largeMultiplier = multiplier("largeMultiplier", 1.87);
  const xlMultiplier = multiplier("xlMultiplier", 2.53);

  if (pricingMode === PricingMode.BASE && basePriceCents == null) {
    return { error: "base_required" };
  }

  const tiers =
    pricingMode === PricingMode.BASE
      ? tiersFromBase({ basePriceCents, mediumMultiplier, largeMultiplier, xlMultiplier })
      : {
          priceSmallCents: parseDollarsToCents(formData.get("priceSmall")),
          priceMediumCents: parseDollarsToCents(formData.get("priceMedium")),
          priceLargeCents: parseDollarsToCents(formData.get("priceLarge")),
          priceXlCents: parseDollarsToCents(formData.get("priceXl")),
        };

  return {
    name,
    category,
    type: typeForCategory(category),
    species: speciesRaw ? (speciesRaw as Species) : null,
    description: ((formData.get("description") as string | null) ?? "").trim() || null,
    staffNotes: ((formData.get("staffNotes") as string | null) ?? "").trim() || null,
    pricingMode,
    basePriceCents,
    mediumMultiplier,
    largeMultiplier,
    xlMultiplier,
    ...tiers,
    priceFlatCents: parseDollarsToCents(formData.get("priceFlat")),
    priceMaxCents: parseDollarsToCents(formData.get("priceMax")),
    durationMins: duration,
    walkInEligible: formData.get("walkInEligible") === "on",
    isActive: formData.get("isActive") === "on",
    sortOrder: Math.round(sortOrder),
  };
}

export async function createService(formData: FormData): Promise<void> {
  await requireManager();
  const parsed = parseService(formData);
  if ("error" in parsed) done(`?error=${parsed.error}`);

  const clash = await prisma.service.findUnique({ where: { name: parsed.name } });
  if (clash) done("?error=duplicate_name");

  await prisma.service.create({ data: parsed });
  done(`?saved=${encodeURIComponent(parsed.name)}`);
}

export async function updateService(formData: FormData): Promise<void> {
  await requireManager();
  const id = (formData.get("id") as string | null) ?? "";
  const parsed = parseService(formData);
  if ("error" in parsed) done(`?error=${parsed.error}`);

  const clash = await prisma.service.findUnique({ where: { name: parsed.name } });
  if (clash && clash.id !== id) done("?error=duplicate_name");

  await prisma.service.update({ where: { id }, data: parsed });
  done(`?saved=${encodeURIComponent(parsed.name)}`);
}

export async function deleteService(formData: FormData): Promise<void> {
  await requireManager();
  const id = (formData.get("id") as string | null) ?? "";

  const booked = await prisma.appointmentService.count({ where: { serviceId: id } });
  if (booked > 0) {
    // Keep the history intact — retiring hides it everywhere customers look.
    await prisma.service.update({ where: { id }, data: { isActive: false } });
    done("?retired=1");
  }

  await prisma.service.delete({ where: { id } });
  done("?deleted=1");
}

export async function saveSurcharge(formData: FormData): Promise<void> {
  await requireManager();

  const id = ((formData.get("id") as string | null) ?? "").trim();
  const label = ((formData.get("label") as string | null) ?? "").trim();
  if (!label) done("?error=label_required");

  const data = {
    label,
    minCents: parseDollarsToCents(formData.get("min")),
    maxCents: parseDollarsToCents(formData.get("max")),
    note: ((formData.get("note") as string | null) ?? "").trim() || null,
    isActive: formData.get("isActive") === "on",
    sortOrder: Math.round(Number((formData.get("sortOrder") as string | null) ?? "0") || 0),
  };

  if (id) {
    await prisma.surcharge.update({ where: { id }, data });
  } else {
    await prisma.surcharge.create({ data });
  }
  done("?saved=surcharge");
}

export async function deleteSurcharge(formData: FormData): Promise<void> {
  await requireManager();
  const id = (formData.get("id") as string | null) ?? "";
  await prisma.surcharge.delete({ where: { id } });
  done("?deleted=1");
}

/**
 * Move every base-priced service by a percentage. This is the whole point of
 * base pricing: one number reprices the shop, and the size ladders follow.
 */
export async function adjustBasePrices(formData: FormData): Promise<void> {
  await requireManager();

  const raw = ((formData.get("percent") as string | null) ?? "").trim().replace(/%$/, "");
  const percent = Number(raw);
  if (!raw || !Number.isFinite(percent) || percent === 0) done("?error=bad_percent");
  if (Math.abs(percent) > 50) done("?error=percent_too_big");

  const services = await prisma.service.findMany({
    where: { pricingMode: PricingMode.BASE, basePriceCents: { not: null } },
  });

  for (const service of services) {
    const basePriceCents = roundToStep((service.basePriceCents ?? 0) * (1 + percent / 100));
    await prisma.service.update({
      where: { id: service.id },
      data: {
        basePriceCents,
        ...tiersFromBase({
          basePriceCents,
          mediumMultiplier: service.mediumMultiplier,
          largeMultiplier: service.largeMultiplier,
          xlMultiplier: service.xlMultiplier,
        }),
      },
    });
  }

  done(`?adjusted=${services.length}&percent=${encodeURIComponent(raw)}`);
}
