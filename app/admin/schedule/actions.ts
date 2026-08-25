"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guards";
import { shopMoment } from "@/lib/shop-time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Shifts are stored as instants, but staff think in shop-local clock time.
 * Everything here converts one to the other rather than trusting the server's
 * own timezone.
 */

function done(week: string, params: string): never {
  revalidatePath("/admin/schedule");
  revalidatePath("/staff/team");
  revalidatePath("/staff/me");
  revalidatePath("/staff");
  redirect(`/admin/schedule?week=${week}${params}`);
}

export async function saveShift(formData: FormData): Promise<void> {
  await requireAdmin();

  const week = ((formData.get("week") as string | null) ?? "").trim();
  const id = ((formData.get("id") as string | null) ?? "").trim();
  const staffId = ((formData.get("staffId") as string | null) ?? "").trim();
  const dayKey = ((formData.get("day") as string | null) ?? "").trim();
  const startTime = ((formData.get("start") as string | null) ?? "").trim();
  const endTime = ((formData.get("end") as string | null) ?? "").trim();

  if (!staffId || !dayKey || !startTime || !endTime) done(week, "&error=incomplete");

  const startsAt = shopMoment(dayKey, startTime);
  const endsAt = shopMoment(dayKey, endTime);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    done(week, "&error=bad_time");
  }
  if (endsAt <= startsAt) done(week, "&error=backwards");

  const data = {
    staffId,
    startsAt,
    endsAt,
    note: ((formData.get("note") as string | null) ?? "").trim() || null,
  };

  if (id) {
    await prisma.staffShift.update({ where: { id }, data });
  } else {
    await prisma.staffShift.create({ data });
  }

  done(week, "&saved=1");
}

export async function deleteShift(formData: FormData): Promise<void> {
  await requireAdmin();
  const week = ((formData.get("week") as string | null) ?? "").trim();
  const id = (formData.get("id") as string | null) ?? "";
  await prisma.staffShift.delete({ where: { id } });
  done(week, "&deleted=1");
}

/**
 * Fill a week from a simple pattern: these people, these weekdays, these
 * hours. Existing shifts for those days are left alone unless asked.
 */
export async function generateWeek(formData: FormData): Promise<void> {
  await requireAdmin();

  const week = ((formData.get("week") as string | null) ?? "").trim();
  const staffIds = formData.getAll("staffIds").map((value) => String(value)).filter(Boolean);
  const days = formData.getAll("days").map((value) => String(value)).filter(Boolean);
  const start = ((formData.get("start") as string | null) ?? "").trim();
  const end = ((formData.get("end") as string | null) ?? "").trim();
  const replace = formData.get("replace") === "on";

  if (staffIds.length === 0 || days.length === 0 || !start || !end) {
    done(week, "&error=incomplete");
  }

  for (const dayKey of days) {
    const startsAt = shopMoment(dayKey, start);
    const endsAt = shopMoment(dayKey, end);
    if (endsAt <= startsAt) done(week, "&error=backwards");

    for (const staffId of staffIds) {
      const existing = await prisma.staffShift.findFirst({
        where: { staffId, startsAt: { gte: shopMoment(dayKey, "00:00") }, endsAt: { lte: shopMoment(dayKey, "23:59") } },
      });

      if (existing && !replace) continue;
      if (existing) {
        await prisma.staffShift.update({ where: { id: existing.id }, data: { startsAt, endsAt } });
      } else {
        await prisma.staffShift.create({ data: { staffId, startsAt, endsAt } });
      }
    }
  }

  done(week, "&generated=1");
}
