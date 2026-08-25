"use server";

import { prisma } from "@/lib/prisma";
import {
  MAX_KENNEL_COLUMNS,
  MAX_KENNEL_ROWS,
  broadcastKennelBoard,
  syncKennelGrid,
} from "@/lib/kennels";
import { requireAdmin } from "@/lib/auth-guards";
import { KENNELABLE_STATUSES } from "@/lib/kennels";
import { StaffRole, StationRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

interface ParsedStation {
  name: string;
  allowedRoles: StaffRole[];
  role: StationRole;
  isActive: boolean;
  kennelRows: number | null;
  kennelColumns: number | null;
}

function parseStation(formData: FormData): ParsedStation | { error: string } {
  const name = ((formData.get("name") as string | null) ?? "").trim();
  const roleRaw = (formData.get("role") as string | null) ?? StationRole.GROOMER;
  const isActive = formData.get("isActive") === "on";

  if (!name) return { error: "name_required" };
  if (!Object.values(StationRole).includes(roleRaw as StationRole)) {
    return { error: "invalid_role" };
  }
  const role = roleRaw as StationRole;

  let kennelRows: number | null = null;
  let kennelColumns: number | null = null;
  if (role === StationRole.KENNEL) {
    kennelRows = Number(formData.get("kennelRows"));
    kennelColumns = Number(formData.get("kennelColumns"));
    const valid =
      Number.isInteger(kennelRows) &&
      Number.isInteger(kennelColumns) &&
      kennelRows >= 1 &&
      kennelColumns >= 1 &&
      kennelRows <= MAX_KENNEL_ROWS &&
      kennelColumns <= MAX_KENNEL_COLUMNS;
    if (!valid) return { error: "invalid_grid" };
  }

  // Empty means anyone on staff may work here.
  const allowedRoles = Array.from(
    new Set(
      formData
        .getAll("allowedRoles")
        .map((value) => String(value))
        // ADMIN is an access role; a station is never limited to it.
        .filter(
          (value): value is StaffRole =>
            value === StaffRole.GROOMER || value === StaffRole.BATHER
        )
    )
  );

  return {
    name,
    allowedRoles,
    role,
    isActive,
    kennelRows,
    kennelColumns,
  };
}

export async function createStation(formData: FormData): Promise<void> {
  await requireAdmin();

  const parsed = parseStation(formData);
  if ("error" in parsed) redirect(`/admin/stations/new?error=${parsed.error}`);

  const station = await prisma.station.create({ data: parsed });

  if (station.role === StationRole.KENNEL) {
    await syncKennelGrid(station.id, parsed.kennelRows ?? 0, parsed.kennelColumns ?? 0);
  }

  revalidatePath("/admin/stations");
  revalidatePath("/staff/stations");
  redirect(`/admin/stations?created=${encodeURIComponent(station.name)}`);
}

export async function updateStation(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = (formData.get("id") as string | null) ?? "";
  const existing = await prisma.station.findUnique({
    where: { id },
    include: {
      kennels: {
        include: { appointments: { where: { status: { in: KENNELABLE_STATUSES } }, select: { id: true } } },
      },
    },
  });
  if (!existing) redirect("/admin/stations?error=not_found");

  const parsed = parseStation(formData);
  if ("error" in parsed) redirect(`/admin/stations/${id}/edit?error=${parsed.error}`);

  const occupied = existing.kennels.filter((kennel) => kennel.appointments.length > 0);

  // Dropping the kennel role would orphan any pet still behind a door.
  if (parsed.role !== StationRole.KENNEL && occupied.length > 0) {
    redirect(`/admin/stations/${id}/edit?error=kennels_occupied`);
  }

  await prisma.station.update({ where: { id }, data: parsed });

  let blocked: string[] = [];
  if (parsed.role === StationRole.KENNEL) {
    const result = await syncKennelGrid(id, parsed.kennelRows ?? 0, parsed.kennelColumns ?? 0);
    blocked = result.blocked;
    await broadcastKennelBoard(id);
  } else if (existing.kennels.length > 0) {
    await prisma.kennel.deleteMany({ where: { stationId: id } });
  }

  revalidatePath("/admin/stations");
  revalidatePath(`/admin/stations/${id}/edit`);
  revalidatePath("/staff/stations");

  // "Save" closes back to the list; "Save and keep editing" stays put.
  const stay = formData.get("then") === "stay";
  const kept = blocked.length > 0 ? `&kept=${encodeURIComponent(blocked.join(","))}` : "";
  redirect(
    stay
      ? `/admin/stations/${id}/edit?saved=1${kept}`
      : `/admin/stations?saved=${encodeURIComponent(parsed.name)}${kept}`
  );
}

/**
 * Capacity is a rule for the whole shop, not a per-station field: groom tables
 * and bathing stations physically hold one pet, and every compartment in a
 * kennel bank is the same size as the others.
 */
export async function saveCapacityRules(formData: FormData): Promise<void> {
  await requireAdmin();

  const raw = ((formData.get("kennelCapacityPerCompartment") as string | null) ?? "").trim();
  const perCompartment = Number(raw);
  if (!Number.isInteger(perCompartment) || perCompartment < 1 || perCompartment > 4) {
    redirect("/admin/stations?error=invalid_capacity");
  }

  await prisma.systemConfig.update({
    where: { id: "global" },
    data: { kennelCapacityPerCompartment: perCompartment },
  });

  revalidatePath("/admin/stations");
  revalidatePath("/staff/stations");
  revalidatePath("/staff");
  redirect("/admin/stations?capacity=1");
}
