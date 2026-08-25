"use server";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guards";
import { setPresence } from "@/lib/presence";
import { getStaffRoles } from "@/lib/staff-roles";
import { isFloorStaff } from "@/lib/utils";
import { StaffPresence } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function refresh(): void {
  revalidatePath("/staff");
  revalidatePath("/staff/team");
  revalidatePath("/staff/stations");
}

/** A person setting their own state from the header. */
export async function setMyPresence(formData: FormData): Promise<void> {
  const staffId = await requireStaff();

  // Only people who take pets have a floor status to set.
  const roles = await getStaffRoles(staffId);
  if (!isFloorStaff(roles)) redirect("/staff?error=not_floor_staff");

  const requested = (formData.get("presence") as string | null) ?? "";
  if (!Object.values(StaffPresence).includes(requested as StaffPresence)) {
    redirect("/staff?error=bad_presence");
  }

  await setPresence(staffId, requested as StaffPresence);
  refresh();
  redirect((formData.get("returnTo") as string | null) || "/staff");
}

/**
 * Take a suggestion: the pet goes to that station with that person, and the
 * groom starts. One tap, because that is what happens on the floor.
 */
export async function applySuggestion(formData: FormData): Promise<void> {
  await requireStaff();

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const stationId = (formData.get("stationId") as string | null) ?? "";
  const staffId = (formData.get("staffId") as string | null) ?? "";

  const [appointment, station, staff] = await Promise.all([
    prisma.appointment.findUnique({ where: { id: appointmentId }, select: { id: true } }),
    prisma.station.findUnique({
      where: { id: stationId },
      select: { id: true, allowedRoles: true },
    }),
    prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, roles: true } }),
  ]);

  if (!appointment || !station || !staff) redirect("/staff?error=suggestion_stale");

  // The floor moves while the page is open: re-check before acting on it.
  const [stationBusy, staffBusy] = await Promise.all([
    prisma.appointment.count({
      where: {
        stationId,
        status: { in: ["CHECKED_IN", "IN_PROGRESS", "DRYING", "FINISHING", "COMPLETE"] },
      },
    }),
    prisma.appointment.count({
      where: {
        staffId,
        status: { in: ["IN_PROGRESS", "DRYING", "FINISHING"] },
      },
    }),
  ]);
  if (stationBusy > 0 || staffBusy > 0) redirect("/staff?error=suggestion_stale");

  if (
    station.allowedRoles.length > 0 &&
    !station.allowedRoles.some((role) => staff.roles.includes(role))
  ) {
    redirect("/staff?error=role_not_allowed");
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { stationId, staffId, kennelId: null, kenneledAt: null },
  });

  refresh();
  redirect("/staff?assigned=1");
}
