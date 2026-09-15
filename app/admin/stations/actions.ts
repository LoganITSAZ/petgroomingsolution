"use server";

import { prisma } from "@/lib/prisma";
import {
  MAX_KENNEL_COLUMNS,
  MAX_KENNEL_ROWS,
  broadcastKennelBoard,
  syncKennelGrid,
} from "@/lib/kennels";
import { requireManager } from "@/lib/auth-guards";
import { suggestStationName } from "@/lib/stations";
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
  kennelCapacityPerCompartment: number;
  kennelHouseholdMaxPerCompartment: number;
}

/**
 * How many pets fit behind one of this unit's doors.
 *
 * Compartments within a bank are the same size as each other, but a bank of
 * small crates and a bank of walk-in runs are not, so the numbers belong to
 * the station. Groom tables and bathing stations hold exactly one pet, which
 * is physical rather than a setting — only a kennel form carries these fields.
 */
function parseCapacity(
  formData: FormData
): { perCompartment: number; householdMax: number } | { error: string } {
  const perCompartment = Number(
    ((formData.get("kennelCapacityPerCompartment") as string | null) ?? "").trim()
  );
  if (!Number.isInteger(perCompartment) || perCompartment < 1 || perCompartment > 4) {
    return { error: "invalid_capacity" };
  }

  /*
   * The household allowance is what a family's dogs may share, so it is only
   * ever equal to or larger than the general rule — a smaller number would be
   * a setting that can never apply.
   */
  const householdMax = Number(
    ((formData.get("kennelHouseholdMaxPerCompartment") as string | null) ?? "").trim()
  );
  if (!Number.isInteger(householdMax) || householdMax < perCompartment || householdMax > 8) {
    return { error: "invalid_household" };
  }

  return { perCompartment, householdMax };
}

/**
 * A station is not named by hand: it is its role plus the next free number, so
 * the shop adds a second bath without deciding what to call it. An existing
 * station keeps its name until its role changes, which renames it.
 *
 * ponytail: two managers adding a station at the same instant can land on the
 * same number — `Station.name` is not unique. Serialise it if that ever bites.
 */
async function parseStation(
  formData: FormData,
  existing?: { id: string; role: StationRole; name: string }
): Promise<ParsedStation | { error: string }> {
  const roleRaw = (formData.get("role") as string | null) ?? StationRole.GROOMER;
  const isActive = formData.get("isActive") === "on";

  if (!Object.values(StationRole).includes(roleRaw as StationRole)) {
    return { error: "invalid_role" };
  }
  const role = roleRaw as StationRole;
  const name =
    existing && existing.role === role
      ? existing.name
      : await suggestStationName(role, existing?.id);

  let kennelRows: number | null = null;
  let kennelColumns: number | null = null;
  // Defaults matter only for the non-kennel roles that ignore them.
  let perCompartment = 1;
  let householdMax = 1;
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

    const capacity = parseCapacity(formData);
    if ("error" in capacity) return capacity;
    perCompartment = capacity.perCompartment;
    householdMax = capacity.householdMax;
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
    kennelCapacityPerCompartment: perCompartment,
    kennelHouseholdMaxPerCompartment: householdMax,
  };
}

export async function createStation(formData: FormData): Promise<void> {
  await requireManager();

  const parsed = await parseStation(formData);
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
  await requireManager();

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

  const parsed = await parseStation(formData, existing);
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

