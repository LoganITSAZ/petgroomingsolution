"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guards";
import { DiscountKind } from "@prisma/client";
import { parseDollarsToCents } from "@/lib/pricing";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function done(params: string): never {
  revalidatePath("/admin/pricing");
  revalidatePath("/staff/customers");
  redirect(`/admin/pricing${params}`);
}

/**
 * Add or update a rate. The two discount columns are mutually exclusive — the
 * unused one is cleared on every save so a tier switched from percent to
 * amount cannot keep a stale figure that nothing reads but everyone sees.
 */
export async function savePricingTier(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = ((formData.get("id") as string | null) ?? "").trim();
  const name = ((formData.get("name") as string | null) ?? "").trim();
  const note = ((formData.get("note") as string | null) ?? "").trim();
  const isActive = formData.get("isActive") === "on";
  const kindRaw = ((formData.get("discountKind") as string | null) ?? "").trim();

  if (!name) done("?error=name_required");

  const discountKind = Object.values(DiscountKind).includes(kindRaw as DiscountKind)
    ? (kindRaw as DiscountKind)
    : DiscountKind.PERCENT;

  let discountPercent: number | null = null;
  let discountCents: number | null = null;

  if (discountKind === DiscountKind.PERCENT) {
    const raw = ((formData.get("discountPercent") as string | null) ?? "").trim();
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
      done("?error=bad_percent");
    }
    discountPercent = parsed;
  } else {
    discountCents = parseDollarsToCents(formData.get("discountAmount"));
    if (discountCents == null || discountCents <= 0) done("?error=bad_amount");
  }

  const sortOrderRaw = ((formData.get("sortOrder") as string | null) ?? "").trim();
  const sortOrder = Number.isInteger(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 0;

  const clash = await prisma.pricingTier.findUnique({ where: { name } });
  if (clash && clash.id !== id) done("?error=duplicate");

  const data = { name, note: note || null, isActive, discountKind, discountPercent, discountCents, sortOrder };

  if (id) {
    await prisma.pricingTier.update({ where: { id }, data });
  } else {
    await prisma.pricingTier.create({ data });
  }

  done(`?saved=${encodeURIComponent(name)}`);
}

/**
 * Remove a rate. Customers on it fall back to list prices — `onDelete: SetNull`
 * on both relations — and visits already quoted keep their snapshotted
 * discount, so nothing reprices retroactively.
 */
export async function deletePricingTier(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = (formData.get("id") as string | null) ?? "";
  const tier = await prisma.pricingTier.findUnique({ where: { id } });
  if (!tier) done("?error=not_found");

  const onTier = await prisma.customer.count({ where: { pricingTierId: id } });
  await prisma.pricingTier.delete({ where: { id } });

  done(`?deleted=${onTier}`);
}
