"use server";

import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import { ServiceCategory, StaffRole } from "@prisma/client";
import { parseDollarsToCents } from "@/lib/pricing";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function done(params: string): never {
  revalidatePath("/admin/staff");
  revalidatePath("/staff/team");
  revalidatePath("/staff/analytics");
  redirect(`/admin/staff${params}`);
}

interface StaffInput {
  name: string;
  email: string;
  roles: StaffRole[];
  defaultStationId: string | null;
  isActive: boolean;
  commissionPercent: number | null;
  hourlyRateCents: number | null;
}

/** A blank box is the absence of an exception, not a rate of zero. */
function parsePercent(value: FormDataEntryValue | null): number | null | "bad" {
  const raw = String(value ?? "").trim().replace(/%$/, "");
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return "bad";
  return parsed;
}

/** Rows to replace this person's exceptions with, or the error key. */
function parseRates(
  formData: FormData
): { serviceId: string | null; category: ServiceCategory | null; percent: number }[] | { error: string } {
  const rows: { serviceId: string | null; category: ServiceCategory | null; percent: number }[] = [];
  for (const [field, value] of formData.entries()) {
    const category = field.startsWith("rateCategory_") ? field.slice("rateCategory_".length) : null;
    const serviceId = field.startsWith("rateService_") ? field.slice("rateService_".length) : null;
    if (!category && !serviceId) continue;
    if (category && !Object.values(ServiceCategory).includes(category as ServiceCategory)) continue;
    const percent = parsePercent(value);
    if (percent === "bad") return { error: "bad_commission" };
    if (percent === null) continue;
    rows.push({
      serviceId,
      category: category ? (category as ServiceCategory) : null,
      percent,
    });
  }
  return rows;
}

function parseStaff(formData: FormData): StaffInput | { error: string } {
  const name = ((formData.get("name") as string | null) ?? "").trim();
  const email = ((formData.get("email") as string | null) ?? "").trim().toLowerCase();
  // Several rows post under the same name; keep the order, drop repeats.
  const roles = Array.from(
    new Set(
      formData
        .getAll("roles")
        .map((value) => String(value))
        .filter((value): value is StaffRole =>
          Object.values(StaffRole).includes(value as StaffRole)
        )
    )
  );

  if (!name) return { error: "name_required" };
  if (!email || !email.includes("@")) return { error: "email_required" };
  if (roles.length === 0) return { error: "invalid_role" };

  const commissionPercent = parsePercent(formData.get("commissionPercent"));
  if (commissionPercent === "bad") return { error: "bad_commission" };

  return {
    name,
    email,
    roles,
    defaultStationId: ((formData.get("defaultStationId") as string | null) ?? "").trim() || null,
    isActive: formData.get("isActive") === "on",
    commissionPercent,
    hourlyRateCents: parseDollarsToCents(formData.get("hourlyRate")),
  };
}

export async function createStaff(formData: FormData): Promise<void> {
  await requireManager();

  const parsed = parseStaff(formData);
  if ("error" in parsed) redirect(`/admin/staff/new?error=${parsed.error}`);

  const password = ((formData.get("password") as string | null) ?? "").trim();
  if (password.length < 8) redirect("/admin/staff/new?error=weak_password");

  const clash = await prisma.staff.findUnique({ where: { email: parsed.email } });
  if (clash) redirect("/admin/staff/new?error=email_taken");

  const rates = parseRates(formData);
  if ("error" in rates) redirect(`/admin/staff/new?error=${rates.error}`);

  await prisma.staff.create({
    data: {
      ...parsed,
      passwordHash: await bcrypt.hash(password, 12),
      commissionRates: { create: rates },
    },
  });

  done(`?created=${encodeURIComponent(parsed.name)}`);
}

export async function updateStaff(formData: FormData): Promise<void> {
  const adminId = await requireManager();

  const id = (formData.get("id") as string | null) ?? "";
  const parsed = parseStaff(formData);
  if ("error" in parsed) redirect(`/admin/staff/${id}/edit?error=${parsed.error}`);

  const existing = await prisma.staff.findUnique({ where: { id } });
  if (!existing) done("?error=not_found");

  const clash = await prisma.staff.findUnique({ where: { email: parsed.email } });
  if (clash && clash.id !== id) redirect(`/admin/staff/${id}/edit?error=email_taken`);

  // An admin locking themselves out of the admin panel is not recoverable
  // from inside the app.
  if (id === adminId && (!parsed.roles.includes(StaffRole.ADMIN) || !parsed.isActive)) {
    redirect(`/admin/staff/${id}/edit?error=self_lockout`);
  }

  const password = ((formData.get("password") as string | null) ?? "").trim();
  if (password && password.length < 8) redirect(`/admin/staff/${id}/edit?error=weak_password`);

  const rates = parseRates(formData);
  if ("error" in rates) redirect(`/admin/staff/${id}/edit?error=${rates.error}`);

  await prisma.staff.update({
    where: { id },
    data: {
      ...parsed,
      ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
      // The form posts every box, so the ticked set is the whole truth.
      commissionRates: { deleteMany: {}, create: rates },
    },
  });

  done(`?saved=${encodeURIComponent(parsed.name)}`);
}

/** Shop-wide fallback used by anyone without their own rate. */
export async function setDefaultCommission(formData: FormData): Promise<void> {
  await requireManager();

  const raw = ((formData.get("defaultCommissionPercent") as string | null) ?? "")
    .trim()
    .replace(/%$/, "");
  const percent = Number(raw);
  if (!raw || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    done("?error=bad_commission");
  }

  await prisma.systemConfig.update({
    where: { id: "global" },
    data: { defaultCommissionPercent: percent },
  });

  done("?commission=1");
}
