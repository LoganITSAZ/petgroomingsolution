"use server";

import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function done(params: string): never {
  revalidatePath("/admin/marketing");
  revalidatePath("/staff/services");
  revalidatePath("/staff");
  revalidatePath("/services");
  revalidatePath("/");
  redirect(`/admin/marketing${params}`);
}

/** Datetime-local strings are wall clock; empty means an open bound. */
function parseWhen(value: FormDataEntryValue | null): Date | null | "invalid" {
  const raw = ((value as string | null) ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "invalid" : parsed;
}

export async function savePromotion(formData: FormData): Promise<void> {
  await requireManager();

  const id = ((formData.get("id") as string | null) ?? "").trim();
  const title = ((formData.get("title") as string | null) ?? "").trim();
  const body = ((formData.get("body") as string | null) ?? "").trim();
  const serviceId = ((formData.get("serviceId") as string | null) ?? "").trim();

  if (!title) done("?error=title_required");
  if (!body) done("?error=body_required");
  if (!serviceId) done("?error=service_required");

  // A promotion advertises a specific service, so it has to point at a live one.
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) done("?error=service_missing");

  const startsAt = parseWhen(formData.get("startsAt"));
  const endsAt = parseWhen(formData.get("endsAt"));
  if (startsAt === "invalid" || endsAt === "invalid") done("?error=invalid_dates");
  if (startsAt && endsAt && endsAt <= startsAt) done("?error=backwards_window");

  const data = {
    serviceId,
    title,
    body,
    code: ((formData.get("code") as string | null) ?? "").trim() || null,
    startsAt,
    endsAt,
    isActive: formData.get("isActive") === "on",
    showOnSite: formData.get("showOnSite") === "on",
    showToStaff: formData.get("showToStaff") === "on",
    sortOrder: Math.round(Number((formData.get("sortOrder") as string | null) ?? "0") || 0),
  };

  if (id) {
    await prisma.promotion.update({ where: { id }, data });
  } else {
    await prisma.promotion.create({ data });
  }
  done(`?saved=${encodeURIComponent(title)}`);
}

export async function deletePromotion(formData: FormData): Promise<void> {
  await requireManager();
  const id = (formData.get("id") as string | null) ?? "";
  await prisma.promotion.delete({ where: { id } });
  done("?deleted=1");
}
