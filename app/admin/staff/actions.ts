"use server";

import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import { StaffRole } from "@prisma/client";
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

  const commissionRaw = ((formData.get("commissionPercent") as string | null) ?? "").trim();
  let commissionPercent: number | null = null;
  if (commissionRaw) {
    const parsed = Number(commissionRaw.replace(/%$/, ""));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return { error: "bad_commission" };
    commissionPercent = parsed;
  }

  return {
    name,
    email,
    roles,
    defaultStationId: ((formData.get("defaultStationId") as string | null) ?? "").trim() || null,
    isActive: formData.get("isActive") === "on",
    commissionPercent,
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

  await prisma.staff.create({
    data: { ...parsed, passwordHash: await bcrypt.hash(password, 12) },
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

  await prisma.staff.update({
    where: { id },
    data: {
      ...parsed,
      ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
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
