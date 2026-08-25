"use server";

import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guards";
import { KENNELABLE_STATUSES, broadcastKennelBoard, kennelHasRoom } from "@/lib/kennels";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Kennel occupancy is a floor operation: any signed-in staff member can move a dog.
function back(stationId: string, params: string): never {
  revalidatePath(`/staff/stations/${stationId}`);
  revalidatePath("/staff/stations");
  revalidatePath("/staff");
  redirect(`/staff/stations/${stationId}${params}`);
}

export async function assignKennel(formData: FormData): Promise<void> {
  await requireStaff();

  const kennelId = (formData.get("kennelId") as string | null) ?? "";
  const appointmentId = ((formData.get("appointmentId") as string | null) ?? "").trim();

  const kennel = await prisma.kennel.findUnique({ where: { id: kennelId } });
  if (!kennel) redirect("/staff/stations?error=kennel_not_found");

  if (!appointmentId) back(kennel.stationId, "?error=no_pet_selected");
  if (!kennel.isActive) back(kennel.stationId, "?error=kennel_out_of_service");
  if (!(await kennelHasRoom(kennel.id, appointmentId))) {
    back(kennel.stationId, "?error=kennel_occupied");
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { kennel: { select: { id: true, stationId: true } } },
  });
  if (!appointment) back(kennel.stationId, "?error=appointment_not_found");
  if (!KENNELABLE_STATUSES.includes(appointment.status)) {
    back(kennel.stationId, "?error=not_in_shop");
  }

  // A pet is only ever behind one door, so this both moves and places it.
  const previousStationId = appointment.kennel?.stationId ?? null;
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { kennelId: kennel.id, kenneledAt: new Date() },
  });

  await broadcastKennelBoard(kennel.stationId);
  if (previousStationId && previousStationId !== kennel.stationId) {
    await broadcastKennelBoard(previousStationId);
    revalidatePath(`/staff/stations/${previousStationId}`);
  }

  back(kennel.stationId, "?assigned=1");
}

export async function releaseKennel(formData: FormData): Promise<void> {
  await requireStaff();

  const kennelId = (formData.get("kennelId") as string | null) ?? "";
  const kennel = await prisma.kennel.findUnique({ where: { id: kennelId } });
  if (!kennel) redirect("/staff/stations?error=kennel_not_found");

  await prisma.appointment.updateMany({
    where: { kennelId: kennel.id, status: { in: KENNELABLE_STATUSES } },
    data: { kennelId: null, kenneledAt: null },
  });

  await broadcastKennelBoard(kennel.stationId);
  back(kennel.stationId, "?released=1");
}

export async function setKennelService(formData: FormData): Promise<void> {
  await requireStaff();

  const kennelId = (formData.get("kennelId") as string | null) ?? "";
  const kennel = await prisma.kennel.findUnique({ where: { id: kennelId } });
  if (!kennel) redirect("/staff/stations?error=kennel_not_found");

  // Taking a door out of service must not strand a pet inside it.
  const inside = await prisma.appointment.count({
    where: { kennelId: kennel.id, status: { in: KENNELABLE_STATUSES } },
  });
  if (kennel.isActive && inside > 0) {
    back(kennel.stationId, "?error=kennel_occupied");
  }

  await prisma.kennel.update({
    where: { id: kennel.id },
    data: { isActive: !kennel.isActive },
  });

  await broadcastKennelBoard(kennel.stationId);
  back(kennel.stationId, kennel.isActive ? "?out_of_service=1" : "?back_in_service=1");
}
