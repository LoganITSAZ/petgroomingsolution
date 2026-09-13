import { prisma } from "@/lib/prisma";
import { AppointmentStatus } from "@prisma/client";
import {
  formatRole,
  formatShopDate,
  formatShopTime,
  formatStatus,
  isFloorStaff,
  shopDayRange,
  statusBadgeClass,
} from "@/lib/utils";
import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";
import { auth } from "@/lib/auth";
import { PRESENCE_CLASS, PRESENCE_LABEL, floorRoster } from "@/lib/presence";
import { describeShifts, isOnShiftNow, scheduleGaps, todaysShifts, weekDays } from "@/lib/schedule";
import StaffProfileDialog, { type StaffProfile } from "@/components/StaffProfileDialog";
import { currentStaffCanManage, currentStaffIsAdmin } from "@/lib/staff-roles";
import { LEADERBOARD_WINDOW_DAYS, getLeaderboard } from "@/lib/analytics";
import { formatCents } from "@/lib/pricing";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Staff" };

/**
 * Floor view of the staff: who is on which pet, and how their day is going.
 * Hiring, deactivating and password resets stay in the admin panel, which is
 * why that screen is "Manage Staff" and this one is just "Staff".
 *
 * The route is still /staff/team. A URL is not verbiage the shop reads, and
 * /staff/staff stutters — renaming the segment would break saved links on the
 * groomers' phones to no visible end.
 */

const ON_FLOOR: AppointmentStatus[] = [
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.DRYING,
  AppointmentStatus.FINISHING,
  AppointmentStatus.COMPLETE,
];


export default async function StaffTeamPage() {
  const session = await auth();
  const isAdmin = session?.user ? await currentStaffIsAdmin() : false;
  const canSeeAnalytics = session?.user ? await currentStaffCanManage() : false;
  const { start, end } = shopDayRange();

  const days = weekDays();
  const weekStart = days[0];
  const weekEnd = new Date(days[6].getTime() + 24 * 60 * 60 * 1000);

  const [
    team,
    todayAppointments,
    onFloor,
    recentActivity,
    roster,
    shifts,
    gaps,
    weekShifts,
    homes,
    leaderboard,
  ] = await Promise.all([
    prisma.staff.findMany({
      select: { id: true, name: true, email: true, roles: true, isActive: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.appointment.findMany({
      where: { scheduledAt: { gte: start, lt: end }, staffId: { not: null } },
      select: { id: true, staffId: true, status: true },
    }),
    prisma.appointment.findMany({
      where: { status: { in: ON_FLOOR }, staffId: { not: null } },
      include: {
        pet: { select: { id: true, name: true, hasBiteHistory: true } },
        customer: { select: { firstName: true, lastName: true } },
        station: { select: { id: true, name: true } },
        services: { include: { service: { select: { name: true } } }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { checkedInAt: "asc" },
    }),
    prisma.appointmentStatusHistory.findMany({
      where: { changedAt: { gte: start, lt: end }, changedById: { not: null } },
      include: { appointment: { include: { pet: { select: { name: true } } } } },
      orderBy: { changedAt: "desc" },
      take: 200,
    }),
    floorRoster(),
    todaysShifts(),
    scheduleGaps(),
    prisma.staffShift.findMany({
      where: { startsAt: { gte: weekStart, lt: weekEnd } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.staff.findMany({
      select: { id: true, defaultStation: { select: { name: true } } },
    }),
    // The same rows /staff/analytics ranks, read here per person so a profile
    // and the leaderboard can never disagree.
    getLeaderboard(),
  ]);

  const presenceById = new Map(roster.map((member) => [member.id, member]));
  const analyticsById = new Map(leaderboard.map((row) => [row.staffId, row]));
  const homeById = new Map(homes.map((row) => [row.id, row.defaultStation?.name ?? null]));

  const weekByStaff = new Map<string, { day: string; hours: string }[]>();
  for (const shift of weekShifts) {
    const entry = {
      day: formatShopDate(shift.startsAt, { weekday: "long", month: "short", day: "numeric" }),
      hours: `${formatShopTime(shift.startsAt)} – ${formatShopTime(shift.endsAt)}`,
    };
    weekByStaff.set(shift.staffId, [...(weekByStaff.get(shift.staffId) ?? []), entry]);
  }

  const lastActionByStaff = new Map<string, (typeof recentActivity)[number]>();
  for (const entry of recentActivity) {
    if (entry.changedById && !lastActionByStaff.has(entry.changedById)) {
      lastActionByStaff.set(entry.changedById, entry);
    }
  }

  const rows = team.map((member) => {
    const assigned = todayAppointments.filter((a) => a.staffId === member.id);
    const finished = assigned.filter(
      (a) =>
        a.status === AppointmentStatus.READY_PICKUP || a.status === AppointmentStatus.PICKED_UP
    );
    return {
      ...member,
      current: onFloor.find((a) => a.staffId === member.id) ?? null,
      assigned: assigned.length,
      finished: finished.length,
      lastAction: lastActionByStaff.get(member.id) ?? null,
      changesToday: recentActivity.filter((e) => e.changedById === member.id).length,
    };
  });

  // Admin-only accounts exist for access, not for grooming: they are listed
  // apart so the schedule reflects who is actually working.
  const active = rows.filter((r) => r.isActive && isFloorStaff(r.roles));
  const serviceAccounts = rows.filter((r) => r.isActive && !isFloorStaff(r.roles));
  const inactive = rows.filter((r) => !r.isActive);
  const working = active.filter((r) => r.current).length;
  const unassignedOnFloor = await prisma.appointment.count({
    where: { status: { in: ON_FLOOR }, staffId: null },
  });

  return (
    <PageShell
      title="Staff"
      subtitle={
        <>
          {working} of {active.length} on the floor working a pet
          {unassignedOnFloor > 0 &&
            ` · ${unassignedOnFloor} pet${unassignedOnFloor !== 1 ? "s" : ""} on the floor with no groomer`}
        </>
      }
      actions={
        isAdmin ? (
          <>
            <Link
              href="/admin/schedule"
              className="text-sm text-amber-700 hover:text-amber-900 underline"
            >
              Edit schedule →
            </Link>
            <Link
              href="/admin/staff"
              className="text-sm text-amber-700 hover:text-amber-900 underline"
            >
              Add or remove staff →
            </Link>
          </>
        ) : null
      }
    >
      {gaps.length > 0 && (
        <PageSection className="bg-amber-50" title="Schedule and floor disagree">
          <ul className="text-sm text-stone-700 space-y-0.5">
            {gaps.map((gap) => (
              <li key={`${gap.staffId}-${gap.kind}`}>
                <span className="font-semibold">{gap.staffName}</span> — {gap.detail}
              </li>
            ))}
          </ul>
        </PageSection>
      )}

      {active.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          No active staff accounts.
        </PageSection>
      ) : (
        /* One line per person: the floor reads this at a glance, and the
           detail that matters is what they are on right now. */
        <PageSection grow scroll padded={false} bodyClassName="divide-y divide-stone-100 text-sm">
          {active.map((member) => {
            const floor = presenceById.get(member.id);
            const shiftHours = describeShifts(shifts.get(member.id));

            // Everything the modal shows is formatted here: it stays a small
            // presentation-only client island.
            const profile: StaffProfile = {
              id: member.id,
              name: member.name,
              email: member.email,
              roles: member.roles.map(formatRole),
              presenceLabel: PRESENCE_LABEL[floor?.state ?? "OFF_SHIFT"],
              presenceClass: PRESENCE_CLASS[floor?.state ?? "OFF_SHIFT"],
              minutesInState: floor?.minutesInState ?? 0,
              scheduledToday: shiftHours,
              onShiftNow: isOnShiftNow(shifts.get(member.id)),
              finished: member.finished,
              assigned: member.assigned,
              changesToday: member.changesToday,
              homeStation: homeById.get(member.id) ?? null,
              current: member.current
                ? {
                    appointmentId: member.current.id,
                    petId: member.current.pet.id,
                    petName: member.current.pet.name,
                    hasBiteHistory: member.current.pet.hasBiteHistory,
                    ownerName: `${member.current.customer.firstName} ${member.current.customer.lastName}`,
                    stationId: member.current.station?.id ?? null,
                    stationName: member.current.station?.name ?? null,
                    statusLabel: formatStatus(member.current.status),
                    statusClass: statusBadgeClass(member.current.status),
                    services:
                      member.current.services.length > 0
                        ? member.current.services
                            .map((line) => line.service?.name ?? formatStatus(line.serviceType))
                            .join(", ")
                        : formatStatus(member.current.serviceType),
                    sinceLabel: member.current.checkedInAt
                      ? `in since ${formatShopTime(member.current.checkedInAt)}`
                      : null,
                  }
                : null,
              week: weekByStaff.get(member.id) ?? [],
              activity: recentActivity
                .filter((entry) => entry.changedById === member.id)
                .slice(0, 8)
                .map((entry) => ({
                  at: formatShopTime(entry.changedAt),
                  petName: entry.appointment.pet.name,
                  statusLabel: formatStatus(entry.status),
                })),
              analytics: (() => {
                const row = analyticsById.get(member.id);
                if (!row) return null;
                return {
                  windowDays: LEADERBOARD_WINDOW_DAYS,
                  today: row.today,
                  week: row.week,
                  month: row.month,
                  lifetime: row.lifetime,
                  bestDay: row.bestDay,
                  streak: row.streak,
                  avgTurnaroundMins: row.avgTurnaroundMins,
                  commissionPercent: row.commissionPercent,
                  payWeek: formatCents(row.payWeekCents),
                  payMonth: formatCents(row.payMonthCents),
                  badges: row.badges,
                };
              })(),
            };

            return (
              <StaffProfileDialog key={member.id} profile={profile} canSeeAnalytics={canSeeAnalytics}>
                <span className="flex items-center justify-between gap-3">
                  {/* Who */}
                  <span className="w-44 shrink-0 min-w-0">
                    <span className="block font-semibold text-stone-900 truncate">
                      {member.name}
                    </span>
                    <span className="block text-[10px] text-stone-400 tracking-tight truncate">
                      {member.roles.map(formatRole).join(" · ")}
                    </span>
                  </span>

                  {/* What they are on */}
                  <span className="flex-1 min-w-0 truncate text-stone-600">
                    {member.current ? (
                      <>
                        <span className="font-semibold text-stone-900">
                          {member.current.pet.name}
                        </span>
                        {member.current.pet.hasBiteHistory && (
                          <span className="ml-1.5 text-[9px] bg-red-100 text-red-700 px-1 rounded font-bold">
                            BITE
                          </span>
                        )}
                        {member.current.station && (
                          <span className="text-stone-400"> · {member.current.station.name}</span>
                        )}
                        <span
                          className={`ml-2 text-[10px] px-1.5 rounded-full font-medium ${
                            statusBadgeClass(member.current.status)
                          }`}
                        >
                          {formatStatus(member.current.status)}
                        </span>
                      </>
                    ) : (
                      <span className="text-stone-400">
                        {floor?.state === "READY" ? "Free to take a pet" : "—"}
                      </span>
                    )}
                  </span>

                  {/* Their day */}
                  <span className="hidden lg:block w-40 shrink-0 text-xs text-stone-400 truncate text-right">
                    {member.lastAction ? (
                      <>
                        {formatShopTime(member.lastAction.changedAt)} ·{" "}
                        {member.lastAction.appointment.pet.name} →{" "}
                        {formatStatus(member.lastAction.status)}
                      </>
                    ) : (
                      "no status changes today"
                    )}
                  </span>

                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span className="text-xs text-stone-400 hidden sm:inline">
                      {shiftHours ?? "not scheduled"}
                    </span>
                    <span className="text-xs text-stone-500">
                      <span className="font-bold text-stone-800">{member.finished}</span>/
                      {member.assigned}
                    </span>
                    {floor && (
                      <>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PRESENCE_CLASS[floor.state]}`}
                        >
                          {PRESENCE_LABEL[floor.state]}
                        </span>
                        <span className="text-xs text-stone-400">{floor.minutesInState}m</span>
                      </>
                    )}
                  </span>
                </span>
              </StaffProfileDialog>
            );
          })}
        </PageSection>
      )}

      {serviceAccounts.length > 0 && (
        <PageSection title={`Access only (${serviceAccounts.length})`} padded={false} bodyClassName="divide-y divide-stone-100">
            {serviceAccounts.map((member) => (
              <div key={member.id} className="px-3 py-2 flex items-center justify-between gap-3">
                <span className="text-stone-600">{member.name}</span>
                <span className="text-xs text-stone-400">
                  {member.roles.map(formatRole).join(" · ")} · not assigned to pets
                </span>
              </div>
            ))}
        </PageSection>
      )}

      {inactive.length > 0 && (
        <PageSection title={`Inactive (${inactive.length})`} padded={false} bodyClassName="divide-y divide-stone-100">
            {inactive.map((member) => (
              <div key={member.id} className="px-4 py-2 flex items-center justify-between">
                <span className="text-stone-500">{member.name}</span>
                <span className="text-xs text-stone-400">
                  {member.roles.map(formatRole).join(" · ")}
                </span>
              </div>
            ))}
        </PageSection>
      )}
    </PageShell>
  );
}
