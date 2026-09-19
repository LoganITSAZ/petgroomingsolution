import { prisma } from "@/lib/prisma";
import { formatShopDate, formatShopTime, shopDayRange } from "@/lib/utils";
import { AppointmentStatus } from "@prisma/client";
import { isWorkStation } from "@/lib/stations";
import { floorRoster } from "@/lib/presence";
import { BOARD_COLUMNS, boardColumnFor, boardWaitingSince } from "@/lib/appointment-flow";
import FloorBoard, { type ColumnCapacity } from "@/components/FloorBoard";
import { assignLifecycleDestination } from "./lifecycle-actions";
import { moveToColumn } from "@/app/staff/appointments/actions";
import { serviceAlerts } from "@/lib/alerts";
import { getConfig } from "@/lib/config";
import { checksForPets, vaccinationBlockers, vaccinationRefusalMessage } from "@/lib/vaccinations";
import { photoUrl } from "@/lib/photos";
import styles from "./dashboard.module.css";
import { DashboardRefresh } from "@/components/DashboardRefresh";
import { PICKUP_LEVEL_LABEL, PICKUP_LEVEL_CLASS, pickupWatchlist } from "@/lib/pickups";
import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Dashboard" };

// Keep detailed operations on their dedicated pages.
const ON_FLOOR: AppointmentStatus[] = [
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.DRYING,
  AppointmentStatus.FINISHING,
  AppointmentStatus.COMPLETE,
];



export default async function StaffDashboard(props: {
  searchParams: Promise<{ assigned?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const now = new Date();
  const { start, end } = shopDayRange(now);

  const [
    todayAppointments,
    onFloor,
    pickups,
    stations,
    roster,
    alerts,
    kennels,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: { OR: [{ scheduledAt: { gte: start, lt: end } }, { status: { in: [...ON_FLOOR, AppointmentStatus.READY_PICKUP] } }] },
      select: {
        id: true,
        status: true,
        staffId: true,
        scheduledAt: true,
        checkedInAt: true,
        completedAt: true,
        statusHistory: { select: { status: true, changedAt: true }, orderBy: { changedAt: "desc" } },
        stationId: true,
        petId: true,
        kennel: { select: { label: true, station: { select: { name: true } } } },
        pet: { select: { name: true, hasBiteHistory: true, photoId: true, photoUrl: true } },
        customer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: { status: { in: ON_FLOOR } },
      select: { id: true, status: true, stationId: true },
    }),
    pickupWatchlist(),
    prisma.station.findMany({
      where: { isActive: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    floorRoster(),
    serviceAlerts(),
    prisma.kennel.findMany({
      where: { isActive: true, station: { isActive: true, role: "KENNEL" } },
      include: { station: { select: { name: true } } },
      orderBy: [{ stationId: "asc" }, { row: "asc" }, { column: "asc" }],
    }),
  ]);

  // ── Today at a glance ─────────────────────────────────────────
  const scheduled = todayAppointments.filter((a) => a.status === AppointmentStatus.SCHEDULED);

  // What to ask for at the door. `checksForPets()` is two queries and returns
  // nothing at all when the gate is off or the shop checks nothing, so a shop
  // that asks for no certificates pays for an empty map.
  const config = await getConfig();
  const arrivalChecks = await checksForPets(scheduled.map((appointment) => appointment.petId), config);
  // ── The board ─────────────────────────────────────────────────
  const workStations = stations.filter((s) => isWorkStation(s.role));

  /*
   * The board's chips: every pet actually in the shop, wherever it is standing.
   * Pets that have not arrived are not on it — there is nothing to place yet —
   * and a station that is full simply shows the pet that is holding it.
   */
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const pickupsById = new Map(pickups.pets.map((pet) => [pet.appointmentId, pet]));
  const boardPets = todayAppointments
    .filter((appointment) => boardColumnFor(appointment.status) !== null)
    .sort((a, b) => boardWaitingSince(a) - boardWaitingSince(b) || a.id.localeCompare(b.id))
    .map((appointment) => ({
      id: appointment.id,
      petName: appointment.pet.name,
      petPhotoUrl: photoUrl(appointment.pet.photoId) ?? appointment.pet.photoUrl,
      kennelName: appointment.kennel
        ? `${appointment.kennel.station.name} · ${appointment.kennel.label}`
        : null,
      ownerName: `${appointment.customer.firstName} ${appointment.customer.lastName}`,
      columnKey: boardColumnFor(appointment.status)?.key ?? BOARD_COLUMNS[0].key,
      stationName: appointment.stationId
        ? (stationsById.get(appointment.stationId)?.name ?? null)
        : null,
      hasBiteHistory: appointment.pet.hasBiteHistory,
      flags: alerts.filter((alert) => alert.appointmentIds?.includes(appointment.id)).map((alert) => ({
        label: alert.id === "no-groomer" ? "No groomer assigned" : "Over booked time",
        severity: alert.severity,
      })),
      pickupNote: appointment.status === AppointmentStatus.COMPLETE
        ? { label: "Notify owner", className: "bg-amber-100 text-amber-800" }
        : (() => {
            const pickup = pickupsById.get(appointment.id);
            return pickup ? {
              label: `${PICKUP_LEVEL_LABEL[pickup.level]} · ${pickup.waitingMins} min`,
              className: PICKUP_LEVEL_CLASS[pickup.level],
            } : undefined;
          })(),
    }));
  const waitingOnFloor = boardPets.filter((pet) => pet.columnKey === BOARD_COLUMNS[0].key);

  /*
   * How full each stage is. A column backed by stations reads "2/4"; a column
   * with none — the shop that dries on the groom table, or has not added a
   * drying station yet — is left out and its header just counts heads.
   */
  const boardCapacity: Record<string, ColumnCapacity> = {};
  for (const column of BOARD_COLUMNS) {
    if (!column.stationRole) continue;
    const ofRole = workStations.filter((station) => station.role === column.stationRole);
    if (ofRole.length === 0) continue;
    boardCapacity[column.key] = {
      used: boardPets.filter((pet) => pet.columnKey === column.key).length,
      capacity: ofRole.length,
    };
  }

  const onShift = roster.filter((member) => member.state !== "OFF_SHIFT");
  const arrivalAlerts = alerts.filter((alert) => alert.id.startsWith("arrival-") || alert.id.startsWith("vaccination-"));
  const columnAlerts = {
    waiting: alerts.filter((alert) => ["waiting-unstarted", "kennel-shortfall"].includes(alert.id)),
    pickup: alerts.filter((alert) => alert.id.startsWith("pickup-")),
  };

  return (
    <PageShell
      className={styles.dashboard}
      title={formatShopDate(now, { weekday: "long", month: "long", day: "numeric" })}
      actions={<>
        <DashboardRefresh updatedAt={now.toISOString()} />
        <Link
          href="/staff/appointments"
          className="text-sm font-bold px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors"
        >
          Full schedule
        </Link>
        <Link href="/staff/appointments/new" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-bold text-brand-on-600">+ Book appointment</Link>
      </>}
    >
      <div className={styles.body}>
        <div className={styles.metrics}>
          {[
            { label: "Arrivals left today", value: scheduled.length, hint: `${scheduled.filter((a) => a.scheduledAt < now).length} past arrival time`, tone: styles.blue, href: "#arrivals" },
            { label: "In service now", value: onFloor.filter((a) => a.status !== "COMPLETE").length, hint: `${onFloor.filter((a) => a.status === "CHECKED_IN").length} checked in, waiting to start`, tone: styles.amber, href: "/staff/stations" },
            { label: "Ready for pickup", value: pickups.pets.length, hint: `${pickups.pets.filter((pet) => ["late", "critical"].includes(pet.level)).length} late pickups`, tone: styles.green, href: "/staff/appointments?status=READY_PICKUP" },
            { label: "Team ready now", value: roster.filter((member) => member.state === "READY").length, hint: `${onShift.length} signed in · ${roster.filter((member) => member.state === "WORKING").length} working`, tone: styles.purple, href: "/staff/team" },
          ].map((metric) => <a key={metric.label} href={metric.href} className={`${styles.metric} ${metric.tone}`}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.hint}</small></a>)}
        </div>
      {searchParams.assigned === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Assigned.
        </p>
      )}
      {searchParams.error === "suggestion_stale" && (
        <p className="border-t border-stone-100 bg-amber-50 px-3 py-2 text-amber-800 text-sm font-medium">
          The storefront moved before that could be applied — here is the current picture.
        </p>
      )}
      {searchParams.error === "not_floor_staff" && (
        <p className="border-t border-stone-100 bg-amber-50 px-3 py-2 text-amber-800 text-sm font-medium">
          Storefront status is for groomers and bathers — an admin-only account does not take pets.
        </p>
      )}
      {searchParams.error === "role_not_allowed" && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          That station is limited to roles this person does not hold.
        </p>
      )}

        <div className={`${styles.panel} ${styles.lifecycle}`}>
            <PageSection
              title="Service lifecycle"
              actions={<span className={styles.floorCount}>{boardPets.length} {boardPets.length === 1 ? "pet" : "pets"} on the floor</span>}
              hint={
                <span>
                  {waitingOnFloor.length > 0 && (
                    <span className="font-bold text-amber-700">{waitingOnFloor.length} waiting · </span>
                  )}
                  From arrival to a happy homecoming
                </span>
              }
            >
              <FloorBoard assign={assignLifecycleDestination} destinations={[
                ...kennels.map((kennel) => ({ value: `kennel:${kennel.id}`, label: `${kennel.station.name} · ${kennel.label}`, kind: "kennel" as const })),
                ...stations.filter((station) => station.role === "BATHING" || station.role === "GROOMER").map((station) => ({
                  value: `station:${station.id}`, label: station.name, kind: station.role === "BATHING" ? "bath" as const : "grooming" as const,
                })),
              ]} arrivals={scheduled.map((appointment) => {
                const blockers = vaccinationBlockers(arrivalChecks.get(appointment.petId) ?? []);
                return {
                  id: appointment.id,
                  petName: appointment.pet.name,
                  arrivalTime: formatShopTime(appointment.scheduledAt),
                  assignedTo: roster.find((member) => member.id === appointment.staffId)?.name ?? "Unassigned",
                  overdue: appointment.scheduledAt < now,
                  warning: blockers.length > 0 ? vaccinationRefusalMessage(blockers, appointment.pet.name) : null,
                };
              })} arrivalAlerts={arrivalAlerts} pets={boardPets} capacity={boardCapacity} columnAlerts={columnAlerts} move={moveToColumn} />
            </PageSection>
        </div>
      </div>
    </PageShell>
  );
}
