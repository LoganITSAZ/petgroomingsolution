import { prisma } from "@/lib/prisma";
import {
  formatShopDate,
  formatStationRole,
  formatStatus,
  shopDayRange,
} from "@/lib/utils";
import { AppointmentStatus, StaffRole, StationRole } from "@prisma/client";
import { stationCapacity } from "@/lib/stations";
import { getShopAnalytics } from "@/lib/analytics";
import { KENNELABLE_STATUSES, capacityConflicts, kennelDemand } from "@/lib/kennels";
import { ALERT_DOT, serviceAlerts } from "@/lib/alerts";
import { assignmentSuggestions, floorBlockers } from "@/lib/recommendations";
import { PRESENCE_CLASS, PRESENCE_LABEL, floorRoster } from "@/lib/presence";
import { describeShifts, isOnShiftNow, scheduleGaps, todaysShifts } from "@/lib/schedule";
import { applySuggestion } from "./presence-actions";
import { pickupWatchlist } from "@/lib/pickups";
import Link from "next/link";
import { PageShell, PageSection, Panel, StatStrip } from "@/components/ui";
import { currentStaffCanManage } from "@/lib/staff-roles";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Dashboard" };

/**
 * Shop floor dashboard, grouped by station: every place a pet can be, with the
 * groomer, the owner and where the service stands, read in one pass.
 * Configuration lives in the admin panel; the shop's numbers are at
 * /staff/analytics, which every staff member can read.
 */

// Statuses that mean the pet is in the shop and being worked on.
/** The dashboard snapshot window — short enough that the floor recognises it. */
const SNAPSHOT_DAYS = 3;

const ON_FLOOR: AppointmentStatus[] = [
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.DRYING,
  AppointmentStatus.FINISHING,
  AppointmentStatus.COMPLETE,
];

const statusColor: Record<string, string> = {
  SCHEDULED: "bg-stone-100 text-stone-600",
  CHECKED_IN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  DRYING: "bg-sky-100 text-sky-700",
  FINISHING: "bg-purple-100 text-purple-700",
  COMPLETE: "bg-green-100 text-green-700",
  READY_PICKUP: "bg-emerald-100 text-emerald-800",
  PICKED_UP: "bg-stone-100 text-stone-400",
};


function minutesSince(from: Date | null): number | null {
  return from ? Math.max(0, Math.round((Date.now() - from.getTime()) / 60000)) : null;
}

export default async function StaffDashboard({
  searchParams,
}: {
  searchParams: { assigned?: string; error?: string };
}) {
  const now = new Date();
  const { start, end } = shopDayRange(now);

  const [
    todayAppointments,
    onFloor,
    pickups,
    stations,
    groomers,
    kennels,
    conflicts,
    snapshot,
    suggestions,
    blockers,
    roster,
    alerts,
    shifts,
    gaps,
    canManageShop,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: { scheduledAt: { gte: start, lt: end } },
      select: { id: true, status: true, staffId: true, scheduledAt: true, pet: { select: { name: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: { status: { in: ON_FLOOR } },
      include: {
        pet: { select: { id: true, name: true, hasBiteHistory: true } },
        customer: { select: { firstName: true, lastName: true } },
        staff: { select: { id: true, name: true } },
        services: { include: { service: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { checkedInAt: "asc" },
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
              select: {
                id: true,
                status: true,
                kenneledAt: true,
                pet: { select: { id: true, name: true, hasBiteHistory: true } },
                customer: { select: { firstName: true, lastName: true } },
                staff: { select: { name: true } },
              },
              orderBy: { kenneledAt: "asc" },
            },
          },
          orderBy: [{ row: "asc" }, { column: "asc" }],
        },
      },
    }),
    // Floor headcount: the people who actually work pets.
    prisma.staff.findMany({
      where: { isActive: true, roles: { hasSome: [StaffRole.GROOMER, StaffRole.BATHER] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    kennelDemand(start, end),
    capacityConflicts(start, end),
    // The dashboard reads the last three days, not the last month: this is a
    // floor screen, and the shape of the week just gone is what it can act on.
    getShopAnalytics(SNAPSHOT_DAYS),
    assignmentSuggestions(),
    floorBlockers(),
    floorRoster(),
    serviceAlerts(),
    todaysShifts(),
    scheduleGaps(),
    currentStaffCanManage(),
  ]);

  // ── Today at a glance ─────────────────────────────────────────
  const scheduled = todayAppointments.filter((a) => a.status === AppointmentStatus.SCHEDULED);
  const cancelled = todayAppointments.filter(
    (a) => a.status === AppointmentStatus.CANCELLED || a.status === AppointmentStatus.NO_SHOW
  );
  const active = todayAppointments.filter(
    (a) => a.status !== AppointmentStatus.CANCELLED && a.status !== AppointmentStatus.NO_SHOW
  );

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
  const groomersOnAPet = groomers.filter((groomer) =>
    onFloor.some((a) => a.staffId === groomer.id)
  ).length;

  const capacityState =
    capacityTotal === 0
      ? { label: "Not configured", tone: "text-stone-400", bar: "bg-stone-300" }
      : capacityUsed >= capacityTotal
        ? { label: "Full", tone: "text-red-700", bar: "bg-red-600" }
        : capacityPercent >= 85
          ? { label: "Nearly full", tone: "text-amber-700", bar: "bg-amber-500" }
          : capacityPercent >= 50
            ? { label: "Busy", tone: "text-amber-700", bar: "bg-amber-400" }
            : { label: "Open", tone: "text-green-700", bar: "bg-green-500" };

  /*
   * The same figures /staff/analytics leads with, over three days rather than
   * thirty. Derived there, not recomputed here, so the two screens can never
   * disagree about what "finished" means.
   */
  const snapshotFigures = [
    {
      label: "Finished",
      value: snapshot.finished,
      hint: `${snapshot.booked} booked`,
    },
    {
      label: "Walk-ins",
      value: snapshot.walkIns,
      hint: `${snapshot.scheduledAppointments} pre-booked`,
    },
    {
      label: "No-show rate",
      value: `${Math.round(snapshot.noShowRate * 100)}%`,
      hint: `${snapshot.noShows} no-show, ${snapshot.cancelled} cancelled`,
    },
    {
      label: "Avg turnaround",
      value: snapshot.avgTurnaroundMins != null ? `${snapshot.avgTurnaroundMins} min` : "—",
      hint: "check-in to finished",
    },
  ];

  const counts = [
    { label: "scheduled", value: scheduled.length },
    { label: "in the shop", value: onFloor.length },
    { label: "ready", value: pickups.pets.length },
    {
      label: "picked up",
      value: todayAppointments.filter((a) => a.status === AppointmentStatus.PICKED_UP).length,
    },
  ];

  return (
    <PageShell
      title={formatShopDate(now, { weekday: "long", month: "long", day: "numeric" })}
      actions={
        <Link
          href="/staff/appointments"
          className="text-sm font-bold px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors"
        >
          Full schedule
        </Link>
      }
    >
      {/*
        The day, in four bands that each answer one question: what is on,
        what is wrong, how full, who is here. It used to be one flex row of
        four panels with min-widths totalling wider than the screen, so the
        order they wrapped in changed with the window and nothing lined up.
      */}
      <StatStrip
        stats={[
          { label: "On the books", value: active.length },
          ...counts.map(({ label, value }) => ({ label, value })),
          ...(cancelled.length > 0
            ? [{ label: "Cancelled / no-show", value: cancelled.length }]
            : []),
        ]}
      />

      <PageSection padded={false}>
        <div className="grid gap-3 px-3 py-3 lg:grid-cols-3">
          {/* What needs chasing, given the most room: it is the only band
              here that asks someone to do something. */}
          <Panel
            title={
              <span className="flex items-baseline justify-between gap-3">
                <span>Needs attention</span>
                {alerts.length > 0 && (
                  <span className="font-medium normal-case tracking-normal text-stone-500">
                    {alerts.filter((alert) => alert.severity === "critical").length} critical
                  </span>
                )}
              </span>
            }
            className="lg:col-span-2"
          >
            {alerts.length === 0 ? (
              <p className="text-sm text-stone-500">
                Nothing to chase — no late pickups, no unclaimed arrivals, nothing overrunning.
              </p>
            ) : (
              <ul className="space-y-1">
                {alerts.slice(0, 5).map((alert) => (
                  <li key={alert.id}>
                    <Link
                      href={alert.href}
                      className="flex items-baseline gap-2 text-sm rounded-md -mx-1 px-1 py-0.5 hover:bg-white transition-colors"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${ALERT_DOT[alert.severity]}`}
                      />
                      <span className="min-w-0">
                        <span className="font-bold text-stone-800">{alert.title}</span>{" "}
                        <span className="text-stone-500">{alert.detail}</span>
                      </span>
                    </Link>
                  </li>
                ))}
                {alerts.length > 5 && (
                  <li className="text-xs text-stone-500 pl-3.5">+{alerts.length - 5} more</li>
                )}
              </ul>
            )}
          </Panel>

          <Panel
            title={
              <span className="flex items-baseline justify-between gap-3">
                <span>Capacity</span>
                <span className={`text-sm font-black normal-case tracking-normal ${capacityState.tone}`}>
                  {capacityState.label}
                </span>
              </span>
            }
          >
            <div className="h-1.5 rounded-full bg-stone-200 overflow-hidden">
              <div
                className={`h-full ${capacityState.bar}`}
                style={{ width: `${Math.min(capacityPercent, 100)}%` }}
              />
            </div>
            <div className="mt-1.5 space-y-0.5 text-xs text-stone-600">
              {capacitySegments.map(({ label, used, total }) => (
                <span
                  key={label}
                  className={`flex items-center justify-between gap-3 ${
                    used >= total ? "text-red-600 font-bold" : ""
                  }`}
                >
                  <span>{label}</span>
                  <span className="tabular-nums">
                    {used}/{total}
                  </span>
                </span>
              ))}
              <span className="flex items-center justify-between gap-3">
                <span>Groomers on a pet</span>
                <span className="tabular-nums">
                  {groomersOnAPet}/{groomers.length}
                </span>
              </span>
            </div>
          </Panel>
        </div>

        {/* Who is here. Chips wrap on their own, so this band gets the full
            width rather than a fixed column that squeezed them to two abreast. */}
        <div className="border-t border-stone-100 px-3 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest">Floor</h2>
            <span className="text-xs text-stone-500">
              {roster.filter((member) => member.state !== "OFF_SHIFT").length} signed in ·{" "}
              {roster.filter((member) => isOnShiftNow(shifts.get(member.id))).length} scheduled now ·{" "}
              <Link href="/staff/team" className="hover:text-stone-800 underline">
                staff
              </Link>
            </span>
          </div>
          {roster.length === 0 ? (
            <p className="text-sm text-stone-500 mt-1.5">No floor staff on file.</p>
          ) : (
            <div className="flex flex-wrap gap-1 mt-2">
              {roster.map((member) => {
                const href = member.working
                  ? `/staff/appointments/${member.working.appointmentId}`
                  : "/staff/team";
                return (
                  <Link
                    key={member.id}
                    href={href}
                    title={[
                      PRESENCE_LABEL[member.state],
                      `${member.minutesInState} min`,
                      member.working
                        ? `${member.working.petName}${member.working.stationName ? ` at ${member.working.stationName}` : ""}`
                        : null,
                      describeShifts(shifts.get(member.id))
                        ? `scheduled ${describeShifts(shifts.get(member.id))}`
                        : "not scheduled today",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    className={`inline-flex items-baseline gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold transition-opacity hover:opacity-80 ${PRESENCE_CLASS[member.state]}`}
                  >
                    <span>{member.name}</span>
                    <span className="font-normal opacity-70">
                      {member.working ? member.working.petName : `${member.minutesInState}m`}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
          {gaps.filter((gap) => gap.kind === "expected").length > 0 && (
            <p className="mt-2 text-sm text-amber-700">
              <span className="font-bold">Scheduled but not signed in:</span>{" "}
              {gaps
                .filter((gap) => gap.kind === "expected")
                .map((gap) => gap.staffName)
                .join(", ")}
            </p>
          )}
        </div>

        {/* The trend behind today's numbers, last. */}
        <div className="border-t border-stone-100 px-3 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest">
              Last {SNAPSHOT_DAYS} days
            </h2>
            {canManageShop && (
              <Link
                href="/staff/analytics"
                className="text-xs text-stone-500 hover:text-stone-800 underline"
              >
                full analytics
              </Link>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {snapshotFigures.map(({ label, value, hint }) => (
              <div key={label} className="rounded-lg border border-stone-200 bg-well px-3 py-2">
                <dd className="text-lg font-black text-stone-900 leading-tight tabular-nums">
                  {value}
                </dd>
                <dt className="text-xs font-medium text-stone-700">{label}</dt>
                <p className="text-[11px] text-stone-500">{hint}</p>
              </div>
            ))}
          </dl>
        </div>
      </PageSection>

      {searchParams.assigned === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Assigned.
        </p>
      )}
      {searchParams.error === "suggestion_stale" && (
        <p className="border-t border-stone-100 bg-amber-50 px-3 py-2 text-amber-800 text-sm font-medium">
          The floor moved before that could be applied — here is the current picture.
        </p>
      )}
      {searchParams.error === "not_floor_staff" && (
        <p className="border-t border-stone-100 bg-amber-50 px-3 py-2 text-amber-800 text-sm font-medium">
          Floor status is for groomers and bathers — an admin-only account does not take pets.
        </p>
      )}
      {searchParams.error === "role_not_allowed" && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          That station is limited to roles this person does not hold.
        </p>
      )}

      {/* What to do with the open stations, right now */}
      {(suggestions.length > 0 || blockers.blocked) && (
        <PageSection
          title="Next moves"
          hint={`${blockers.readyStaff} ready · ${blockers.waitingPets} waiting · ${blockers.openStations} station${blockers.openStations === 1 ? "" : "s"} open`}
        >
          {suggestions.length === 0 ? (
            <p className="text-sm text-stone-500 border border-stone-200 rounded-lg bg-well px-3 py-2">
              {blockers.blocked}
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((suggestion) => (
                <form
                  key={suggestion.stationId}
                  action={applySuggestion}
                  className="bg-white border border-emerald-200 rounded-lg px-3 py-2"
                >
                  <input type="hidden" name="appointmentId" value={suggestion.appointmentId} />
                  <input type="hidden" name="stationId" value={suggestion.stationId} />
                  <input type="hidden" name="staffId" value={suggestion.staffId} />

                  <p className="text-[11px] font-bold text-stone-500 uppercase tracking-wide">
                    {suggestion.stationName} is open
                  </p>
                  <p className="text-sm font-bold text-stone-900 mt-0.5">
                    {suggestion.petName}
                    {suggestion.hasBiteHistory && (
                      <span className="ml-1.5 text-[9px] bg-red-100 text-red-700 px-1 rounded font-bold align-middle">
                        BITE
                      </span>
                    )}
                    <span className="font-normal text-stone-500"> → {suggestion.staffName}</span>
                  </p>
                  <p className="text-xs text-stone-400">{suggestion.reasons.join(" · ")}</p>
                  <button
                    type="submit"
                    className="mt-1.5 w-full bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg py-1.5 text-xs font-semibold transition-colors"
                  >
                    Assign
                  </button>
                </form>
              ))}
            </div>
          )}
        </PageSection>
      )}


      {/* Kennel space about to run out */}
      {(conflicts.shortfall > 0 || conflicts.overstaying.length > 0) && (
        <PageSection
          className={conflicts.shortfall > 0 ? "bg-red-50" : "bg-amber-50"}
        >
          <h2
            className={`font-bold text-xs uppercase tracking-widest ${
              conflicts.shortfall > 0 ? "text-red-800" : "text-amber-800"
            }`}
          >
            {conflicts.shortfall > 0
              ? `Kennel space short by ${conflicts.shortfall}`
              : "Kennels held by late pickups"}
          </h2>
          <p className="text-sm text-stone-700 mt-0.5">
            {conflicts.committed}/{conflicts.capacity} committed
            {conflicts.incoming > 0 && ` · ${conflicts.incoming} still to arrive`}
            {conflicts.overstaying.length > 0 &&
              ` · ${conflicts.overstaying.length} waiting to be collected`}
          </p>
          {conflicts.overstaying.length > 0 && (
            <ul className="mt-1 divide-y divide-amber-100 text-sm">
              {conflicts.overstaying.map((pet) => (
                <li key={pet.appointmentId} className="py-1 flex items-center justify-between gap-3">
                  <Link
                    href={`/staff/appointments/${pet.appointmentId}`}
                    className="truncate hover:text-amber-900"
                  >
                    <span className="font-semibold text-stone-900">{pet.petName}</span>
                    <span className="text-stone-600"> · {pet.ownerName}</span>
                    {pet.kennelLabel && (
                      <span className="text-stone-400"> · kennel {pet.kennelLabel}</span>
                    )}
                  </Link>
                  <span className="whitespace-nowrap text-xs">
                    {pet.phone && (
                      <a href={`tel:${pet.phone}`} className="text-amber-800 hover:underline mr-2">
                        {pet.phone}
                      </a>
                    )}
                    <span className="text-stone-500">waiting {pet.waitingMins} min</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      )}

      {/* The board — one vertical column for each kind of station */}
      <PageSection grow scroll bodyClassName="grid gap-4 lg:grid-cols-3 items-start">
        {[StationRole.GROOMER, StationRole.BATHING, StationRole.DRYING].map((role) => {
        const list = workStations.filter((s) => s.role === role);
        if (list.length === 0) return null;

        return (
          <section key={role}>
            <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-2">
              {formatStationRole(role)}{" "}
            <span className="text-stone-400">
              ({list.reduce((n, station) => n + (occupantsByStation.get(station.id)?.length ?? 0), 0)}
              /{list.reduce((n, station) => n + stationCapacity(station), 0)})
            </span>
            </h2>
            <div className="grid gap-2">
              {list.map((station) => {
                const occupants = occupantsByStation.get(station.id) ?? [];
                const capacity = stationCapacity(station);
                const full = occupants.length >= capacity;

                return (
                  <Link
                    key={station.id}
                    href={`/staff/stations/${station.id}`}
                    className={`rounded-lg border px-3 py-2 transition-colors ${
                      occupants.length > 0
                        ? "bg-white border-stone-200 hover:border-amber-300"
                        : "bg-stone-50 border-dashed border-stone-300 hover:border-stone-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wide truncate">
                        {station.name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${
                          full
                            ? "bg-red-100 text-red-700"
                            : occupants.length > 0
                              ? "bg-amber-100 text-amber-700"
                              : "bg-stone-200 text-stone-500"
                        }`}
                      >
                        {occupants.length}/{capacity}
                      </span>
                    </div>

                    {occupants.length === 0 ? (
                      <p className="text-stone-400 text-xs mt-1">Open</p>
                    ) : (
                      <ul className="mt-1 divide-y divide-stone-100 text-sm">
                        {occupants.map((appt) => {
                          const mins = minutesSince(appt.checkedInAt);
                          const over =
                            appt.durationMins != null && mins != null && mins > appt.durationMins;
                          return (
                            <li key={appt.id} className="py-0.5">
                              <p className="font-bold text-stone-900 truncate">
                                {appt.pet.name}
                                {appt.pet.hasBiteHistory && (
                                  <span className="ml-1 text-[9px] bg-red-100 text-red-700 px-1 rounded font-bold align-middle">
                                    BITE
                                  </span>
                                )}
                                <span className="font-normal text-stone-500">
                                  {" "}
                                  · {appt.customer.firstName} {appt.customer.lastName}
                                </span>
                              </p>
                              <p className="text-xs flex justify-between gap-2">
                                <span className={appt.staff ? "text-stone-500" : "text-amber-700"}>
                                  {appt.staff?.name ?? "No groomer"}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className={`text-[10px] px-1.5 rounded-full font-medium ${
                                      statusColor[appt.status] ?? ""
                                    }`}
                                  >
                                    {formatStatus(appt.status)}
                                  </span>
                                  {mins != null && (
                                    <span className={over ? "text-red-600 font-semibold" : "text-stone-400"}>
                                      {mins}m
                                    </span>
                                  )}
                                </span>
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        );
        })}

        {/* Kennels — same card as the stations above, one per unit */}
        {kennelStations.length > 0 && (
          <section>
          <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-2">
            {formatStationRole("KENNEL")}{" "}
            <span className="text-stone-400">
              ({kennelStations.length} unit{kennelStations.length !== 1 ? "s" : ""} ·{" "}
              {kennelOccupied}/{kennelTotal} in use
              {kennels.reserved > 0 && `, ${kennels.reserved} still expected`}
              {kennels.capacity > 0 && kennels.free === 0 && " — none free"})
            </span>
          </h2>
            <div className="grid gap-2">
            {kennelStations.map((station) => {
              const occupants = station.kennels.flatMap((kennel) =>
                kennel.appointments.map((appt) => ({ ...appt, label: kennel.label }))
              );
              const capacity =
                station.kennels.filter((kennel) => kennel.isActive).length * kennels.perCompartment;
              const full = occupants.length >= capacity;

              return (
                <Link
                  key={station.id}
                  href={`/staff/stations/${station.id}`}
                  className={`rounded-lg border px-3 py-2 transition-colors ${
                    occupants.length > 0
                      ? "bg-white border-stone-200 hover:border-emerald-300"
                      : "bg-stone-50 border-dashed border-stone-300 hover:border-stone-400"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wide truncate">
                      {station.name}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${
                        full
                          ? "bg-red-100 text-red-700"
                          : occupants.length > 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-stone-200 text-stone-500"
                      }`}
                    >
                      {occupants.length}/{capacity}
                    </span>
                  </div>

                  {occupants.length === 0 ? (
                    <p className="text-stone-400 text-xs mt-1">Empty</p>
                  ) : (
                    <ul className="mt-1 divide-y divide-stone-100 text-sm">
                      {occupants.map((occupant) => {
                        const mins = minutesSince(occupant.kenneledAt);
                        return (
                          <li key={occupant.id} className="py-0.5">
                            <p className="font-bold text-stone-900 truncate">
                              <span className="text-stone-500 font-black">{occupant.label}</span>{" "}
                              {occupant.pet.name}
                              {occupant.pet.hasBiteHistory && (
                                <span className="ml-1 text-[9px] bg-red-100 text-red-700 px-1 rounded font-bold align-middle">
                                  BITE
                                </span>
                              )}
                              <span className="font-normal text-stone-500">
                                {" "}
                                · {occupant.customer.firstName} {occupant.customer.lastName}
                              </span>
                            </p>
                            <p className="text-xs flex justify-between gap-2">
                              <span className={occupant.staff ? "text-stone-500" : "text-amber-700"}>
                                {occupant.staff?.name ?? "No groomer"}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span
                                  className={`text-[10px] px-1.5 rounded-full font-medium ${
                                    statusColor[occupant.status] ?? ""
                                  }`}
                                >
                                  {formatStatus(occupant.status)}
                                </span>
                                {mins != null && <span className="text-stone-400">{mins}m</span>}
                              </span>
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Link>
              );
            })}
          </div>
          </section>
        )}
      </PageSection>
    </PageShell>
  );
}
