import { prisma } from "@/lib/prisma";
import {
  formatShopDate,
  formatShopTime,
  formatStationRole,
  shopDayRange,
} from "@/lib/utils";
import { AppointmentStatus, StationRole } from "@prisma/client";
import { stationCapacity } from "@/lib/stations";
import { floorRoster } from "@/lib/presence";
import { KENNELABLE_STATUSES, kennelDemand } from "@/lib/kennels";
import { BOARD_COLUMNS, boardColumnFor } from "@/lib/appointment-flow";
import FloorBoard, { type ColumnCapacity } from "@/components/FloorBoard";
import { moveToColumn } from "@/app/staff/appointments/actions";
import { ALERT_DOT, serviceAlerts } from "@/lib/alerts";
import styles from "./dashboard.module.css";
import { DashboardRefresh } from "@/components/DashboardRefresh";
import { PICKUP_LEVEL_LABEL, PICKUP_LEVEL_CLASS, formatWait, pickupWatchlist } from "@/lib/pickups";
import Link from "next/link";
import { Meter, PageShell, PageSection, fillTone } from "@/components/ui";
import { currentStaffCanManage } from "@/lib/staff-roles";

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
    kennels,
    roster,
    alerts,
    canManageShop,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: { scheduledAt: { gte: start, lt: end } },
      select: {
        id: true,
        status: true,
        staffId: true,
        scheduledAt: true,
        stationId: true,
        pet: { select: { name: true, hasBiteHistory: true } },
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
      include: {
        kennels: {
          select: {
            id: true,
            label: true,
            isActive: true,
            appointments: {
              where: { status: { in: KENNELABLE_STATUSES } },
              select: { id: true },
            },
          },
          orderBy: [{ row: "asc" }, { column: "asc" }],
        },
      },
    }),
    kennelDemand(start, end),
    floorRoster(),
    serviceAlerts(),
    currentStaffCanManage(),
  ]);

  // ── Today at a glance ─────────────────────────────────────────
  const scheduled = todayAppointments.filter((a) => a.status === AppointmentStatus.SCHEDULED);
  // ── The board ─────────────────────────────────────────────────
  // Stations can hold more than one pet, so occupancy is a list per station.
  const occupantsByStation = new Map<string, typeof onFloor>();
  for (const appointment of onFloor) {
    if (!appointment.stationId) continue;
    const list = occupantsByStation.get(appointment.stationId) ?? [];
    list.push(appointment);
    occupantsByStation.set(appointment.stationId, list);
  }
  const workStations = stations.filter((s) => s.role !== StationRole.KENNEL);
  const kennelStations = stations.filter((s) => s.role === StationRole.KENNEL);

  /*
   * The board's chips: every pet actually in the shop, wherever it is standing.
   * Pets that have not arrived are not on it — there is nothing to place yet —
   * and a station that is full simply shows the pet that is holding it.
   */
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const pickupsById = new Map(pickups.pets.map((pet) => [pet.appointmentId, pet]));
  const boardPets = todayAppointments
    .filter((appointment) => boardColumnFor(appointment.status) !== null)
    .map((appointment) => ({
      id: appointment.id,
      petName: appointment.pet.name,
      ownerName: `${appointment.customer.firstName} ${appointment.customer.lastName}`,
      columnKey: boardColumnFor(appointment.status)?.key ?? BOARD_COLUMNS[0].key,
      stationName: appointment.stationId
        ? (stationsById.get(appointment.stationId)?.name ?? null)
        : null,
      hasBiteHistory: appointment.pet.hasBiteHistory,
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

  const kennelTotal = kennels.capacity;
  const kennelOccupied = kennelStations.reduce(
    (n, s) => n + s.kennels.reduce((inside, kennel) => inside + kennel.appointments.length, 0),
    0
  );

  // ── Capacity ──────────────────────────────────────────────────
  const segment = (role: StationRole) => {
    const list = workStations.filter((s) => s.role === role);
    return {
      label: formatStationRole(role),
      total: list.reduce((n, station) => n + stationCapacity(station), 0),
      used: list.reduce((n, station) => n + (occupantsByStation.get(station.id)?.length ?? 0), 0),
    };
  };

  const capacitySegments = [
    segment(StationRole.GROOMER),
    segment(StationRole.BATHING),
    segment(StationRole.DRYING),
    { label: "Kennels", total: kennelTotal, used: kennelOccupied },
  ].filter((s) => s.total > 0);

  const capacityTotal = capacitySegments.reduce((n, s) => n + s.total, 0);
  const capacityUsed = capacitySegments.reduce((n, s) => n + s.used, 0);
  const capacityPercent = capacityTotal === 0 ? 0 : Math.round((capacityUsed / capacityTotal) * 100);

  const capacityState = fillTone(capacityUsed, capacityTotal);

  const onShift = roster.filter((member) => member.state !== "OFF_SHIFT");
  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;

  return (
    <PageShell
      className={styles.dashboard}
      subtitle={formatShopDate(now, { weekday: "long", month: "short", day: "numeric" })}
      title="Shop overview"
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
            { label: "Ready for pickup", value: pickups.pets.length, hint: `${pickups.pets.filter((pet) => ["late", "critical"].includes(pet.level)).length} late pickups`, tone: styles.green, href: "#pickups" },
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

      {alerts.length > 0 && (
        <div
          role="alert"
          className={`border-t px-3 py-2 ${
            criticalCount > 0
              ? "border-red-100 bg-red-50 text-red-900"
              : "border-amber-100 bg-amber-50 text-amber-900"
          }`}
        >
          <p className="text-sm font-black">
            {alerts.length === 1 ? "1 thing needs" : `${alerts.length} things need`} attention
            {criticalCount > 0 && ` — ${criticalCount} critical`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex items-baseline gap-2 text-sm">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ALERT_DOT[alert.severity]}`}
                />
                <Link href={alert.href} className="min-w-0 hover:underline">
                  <span className="font-bold">{alert.title}</span>{" "}
                  <span className="opacity-80">{alert.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

        {workStations.length > 0 && (
          /*
            The floor, arranged by hand. It answers what the "no station" list
            used to — the Waiting column is that list — and lets it be fixed in
            the same glance instead of on each pet's own page.
          */
          <PageSection tone="muted">
            <h2 className="mb-1.5 flex items-baseline gap-1.5 text-xs font-bold uppercase tracking-widest text-stone-500">
              Where everyone is standing
              <span className={waitingOnFloor.length > 0 ? "text-amber-700" : "text-stone-400"}>
                {waitingOnFloor.length} waiting
              </span>
              <span className="ml-auto font-medium normal-case tracking-normal text-stone-400">
                Drag a pet to a stage, or tap it and choose
              </span>
            </h2>
            <FloorBoard pets={boardPets} capacity={boardCapacity} move={moveToColumn} />
          </PageSection>
        )}

        <div className={styles.grid}>
          <div className={styles.column}>
            <div id="arrivals" className={`${styles.panel} ${styles.blue}`}>
      <PageSection title="Arriving next" hint={`${scheduled.length} remaining today`}>
        {scheduled.length === 0 ? <p className="text-sm text-muted">No more arrivals scheduled today.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Next four scheduled arrivals, including overdue check-ins</caption>
              <thead className="text-xs text-muted"><tr><th scope="col" className="py-2">Arrival</th><th scope="col">Pet</th><th scope="col">Assigned to</th><th scope="col">Check-in</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{scheduled.slice(0, 4).map((appointment) => (
                <tr key={appointment.id}>
                  <td className="py-3 whitespace-nowrap pr-3 tabular-nums">{formatShopTime(appointment.scheduledAt)}</td>
                  <th scope="row" className="pr-3"><Link className="underline" href={`/staff/appointments/${appointment.id}`}>{appointment.pet.name}</Link></th>
                  <td className="pr-3">{roster.find((member) => member.id === appointment.staffId)?.name ?? "Unassigned"}</td>
                  <td className={appointment.scheduledAt < now ? "text-amber-700 font-semibold" : "text-muted"}>{appointment.scheduledAt < now ? "Past arrival time" : "Expected"}</td>
                </tr>
              ))}</tbody>
            </table>
            {scheduled.length > 4 && <Link href="/staff/appointments" className="text-sm underline">View all {scheduled.length} expected arrivals</Link>}
          </div>
        )}
      </PageSection>

            </div>
          </div>
          <div className={styles.column}>
            <div id="pickups" className={`${styles.panel} ${styles.green}`}>
              <PageSection title="Waiting for pickup" hint="Longest wait first">
                <div className={styles.queue}>
                  {pickups.pets.slice(0, 4).map((pet) => <div key={pet.appointmentId} className={styles.pet}>
                    <div><Link href={`/staff/appointments/${pet.appointmentId}`} className="text-sm font-bold text-ink">{pet.petName}</Link><p className="text-xs text-muted">{pet.ownerName}{pet.kennelLabel && ` · Kennel ${pet.kennelLabel}`}</p>{pet.phone && <a className="text-xs font-semibold text-brand-text" href={`tel:${pet.phone}`}>Call {pet.phone}</a>}</div>
                    <div className="text-right"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${PICKUP_LEVEL_CLASS[pet.level]}`} title={PICKUP_LEVEL_LABEL[pet.level]}>{formatWait(pet.waitingMins)}</span></div>
                  </div>)}
                  {pickups.pets.length > 4 && <Link href="/staff/appointments?status=READY_PICKUP" className="text-sm underline">View all {pickups.pets.length} pickups</Link>}
                  {pickups.pets.length === 0 && <p className="py-3 text-sm text-muted">No pets waiting for pickup.</p>}
                </div>
              </PageSection>
            </div>
          </div>
        </div>
            <div className={`${styles.panel} ${styles.green}`}>
      <PageSection
        title="Space available now"
        hint={
          <span>
            <span className={`font-bold ${capacityState.text}`}>{capacityState.label}</span>
            {capacityTotal > 0 && ` · ${capacityPercent}% of ${capacityTotal} spaces in use`}
          </span>
        }
      >
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
          {capacitySegments.map(({ label, used, total }) => (
            <Meter key={label} label={label} used={used} total={total} />
          ))}
        </div>
        {capacitySegments.length === 0 && <p className="text-sm text-muted">No station capacity configured.</p>}
      </PageSection>
            </div>
        <nav aria-label="More shop detail" className="flex flex-wrap gap-x-5 gap-y-2 px-1 text-sm text-muted">
          <Link href="/staff/stations" className="underline">Floor & stations</Link>
          <Link href="/staff/team" className="underline">Team & workload</Link>
          {canManageShop && <Link href="/staff/analytics" className="underline">Business analytics</Link>}
        </nav>
      </div>
    </PageShell>
  );
}
