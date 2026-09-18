import { prisma } from "@/lib/prisma";
import { formatShopDate, formatShopTime, shopDayRange } from "@/lib/utils";
import { AppointmentStatus } from "@prisma/client";
import { isWorkStation } from "@/lib/stations";
import { floorRoster } from "@/lib/presence";
import { BOARD_COLUMNS, boardColumnFor, boardWaitingSince } from "@/lib/appointment-flow";
import FloorBoard, { type ColumnCapacity } from "@/components/FloorBoard";
import { moveToColumn } from "@/app/staff/appointments/actions";
import { serviceAlerts } from "@/lib/alerts";
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
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: { scheduledAt: { gte: start, lt: end } },
      select: {
        id: true,
        status: true,
        staffId: true,
        scheduledAt: true,
        checkedInAt: true,
        completedAt: true,
        statusHistory: { select: { status: true, changedAt: true }, orderBy: { changedAt: "desc" } },
        stationId: true,
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
  ]);

  // ── Today at a glance ─────────────────────────────────────────
  const scheduled = todayAppointments.filter((a) => a.status === AppointmentStatus.SCHEDULED);
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
  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;

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

      {alerts.length > 0 && (
        <details className={`${styles.attention} ${styles[criticalCount > 0 ? "critical" : alerts.some((alert) => alert.severity === "warning") ? "warning" : "info"]}`}>
          <summary className={styles.attentionHeader}>
            <span className={styles.attentionHeading}>
              <svg className={styles.attentionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M10.3 4.1 2.5 17.5A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.5L13.7 4.1a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4" strokeLinecap="round" />
                <circle cx="12" cy="16.5" r=".8" fill="currentColor" stroke="none" />
              </svg>
              <span className={styles.attentionLabel}>{alerts.length === 1 ? "1 item needs" : `${alerts.length} items need`} attention</span>
            </span>
            <span className={styles.attentionSummary}>
              {criticalCount > 0 && <span className={styles.attentionCritical}>{criticalCount} critical</span>}
              <span className={styles.attentionExpand}>View issues</span>
              <span className={styles.attentionCollapse}>Hide issues</span>
              <span className={styles.attentionChevron} aria-hidden="true">⌄</span>
            </span>
          </summary>
          <ul className={styles.attentionList}>
            {alerts.map((alert) => (
              <li key={alert.id}>
                <Link href={alert.href} className={styles.attentionRow}>
                  <span className={`${styles.attentionPriority} ${styles[alert.severity]}`}>
                    <span className={styles.attentionDot} aria-hidden="true" />
                    {{ critical: "Critical", warning: "Follow up", info: "Notice" }[alert.severity]}
                  </span>
                  <span className={styles.attentionCopy}>
                    <span className={styles.attentionTitle}>{alert.title}</span>
                    <span className={styles.attentionDetail}>{alert.detail}</span>
                  </span>
                  <span className={styles.attentionArrow} aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

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

        {workStations.length > 0 && (
          <div className={`${styles.panel} ${styles.amber}`}>
            <PageSection
              title="Service lifecycle"
              hint={
                <span>
                  {waitingOnFloor.length > 0 && (
                    <span className="font-bold text-amber-700">{waitingOnFloor.length} waiting · </span>
                  )}
                  Drag a pet to a stage, or tap it and choose
                </span>
              }
            >
              <FloorBoard pets={boardPets} capacity={boardCapacity} move={moveToColumn} />
            </PageSection>
          </div>
        )}
      </div>
    </PageShell>
  );
}
