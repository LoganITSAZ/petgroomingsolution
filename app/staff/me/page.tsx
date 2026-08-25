import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";
import { AppointmentStatus, StaffPresence } from "@prisma/client";
import {
  PRESENCE_CLASS,
  PRESENCE_LABEL,
  SETTABLE_PRESENCE,
  floorRoster,
} from "@/lib/presence";
import { setMyPresence } from "@/app/staff/presence-actions";
import { moveStatus } from "@/app/staff/appointments/actions";
import { nextStatus } from "@/lib/appointment-flow";
import { describeShifts, isOnShiftNow, todaysShifts } from "@/lib/schedule";
import {
  formatServiceType,
  formatShopDate,
  formatShopTime,
  formatStatus,
  isFloorStaff,
  shopDayRange,
} from "@/lib/utils";
import { getStaffRoles } from "@/lib/staff-roles";
import { OCCUPYING_STATUSES } from "@/lib/stations";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "My shift" };

/**
 * A groomer's own shift, sized for a phone held in one hand: what I am, what I
 * am on, and what is coming to me next. Everything here is about the person
 * looking at it — the shop-wide picture is the dashboard.
 */

export default async function MyShiftPage() {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") redirect("/login?type=staff");

  const staffId = session.user.id;

  // A shift belongs to someone who works pets. Admin-only accounts have none.
  if (!isFloorStaff(await getStaffRoles(staffId))) redirect("/staff");

  const { start, end } = shopDayRange();

  const [me, current, mine, roster, shifts, week] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: staffId },
      select: { name: true, presence: true, presenceSince: true, roles: true },
    }),
    prisma.appointment.findFirst({
      where: { staffId, status: { in: OCCUPYING_STATUSES } },
      include: {
        pet: { select: { id: true, name: true, hasBiteHistory: true, groomingNotes: true } },
        customer: { select: { firstName: true, lastName: true, phone: true } },
        station: { select: { id: true, name: true } },
        services: { include: { service: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { checkedInAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: { staffId, scheduledAt: { gte: start, lt: end } },
      include: {
        pet: { select: { name: true } },
        customer: { select: { lastName: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    floorRoster(),
    todaysShifts(),
    prisma.staffShift.findMany({
      where: { staffId, startsAt: { gte: start, lt: new Date(start.getTime() + 7 * 86400000) } },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  if (!me) redirect("/staff");

  const minutesInState = Math.max(
    0,
    Math.round((Date.now() - me.presenceSince.getTime()) / 60000)
  );
  const state = roster.find((member) => member.id === staffId)?.state ?? me.presence;
  const done = mine.filter(
    (visit) =>
      visit.status === AppointmentStatus.READY_PICKUP ||
      visit.status === AppointmentStatus.PICKED_UP
  ).length;
  const upNext = mine.filter(
    (visit) =>
      visit.status === AppointmentStatus.SCHEDULED ||
      visit.status === AppointmentStatus.CHECKED_IN
  );
  const step = current ? nextStatus(current.status) : null;

  return (
    <PageShell
      title={me.name}
      className="max-w-lg mx-auto w-full"
      subtitle={
        <>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${PRESENCE_CLASS[state]}`}>
            {PRESENCE_LABEL[state]}
          </span>
          <span className="ml-2">for {minutesInState} min</span>
          <span className="ml-2 text-stone-400">
            · {done}/{mine.length} done today
          </span>
          <span className="block mt-0.5">
            {describeShifts(shifts.get(staffId)) ? (
              <>
                Scheduled {describeShifts(shifts.get(staffId))}
                {isOnShiftNow(shifts.get(staffId)) && (
                  <span className="ml-1.5 text-[10px] font-bold text-green-700 uppercase">
                    on shift
                  </span>
                )}
              </>
            ) : (
              <span className="text-stone-400">Not scheduled today</span>
            )}
          </span>
        </>
      }
    >
      {/* Presence: big targets, because this is tapped with wet hands */}
      <PageSection tone="muted" bodyClassName="grid grid-cols-2 gap-2">
        {SETTABLE_PRESENCE.map((option) => (
          <form key={option} action={setMyPresence}>
            <input type="hidden" name="presence" value={option} />
            <input type="hidden" name="returnTo" value="/staff/me" />
            <button
              type="submit"
              className={`w-full rounded-xl py-3 text-sm font-bold transition-colors ${
                me.presence === option
                  ? `${PRESENCE_CLASS[option]} ring-2 ring-stone-900/10`
                  : "bg-white border border-stone-200 text-stone-600 hover:border-stone-300"
              }`}
            >
              {PRESENCE_LABEL[option]}
              {me.presence === option && (
                <span className="block text-[10px] font-medium opacity-70">now</span>
              )}
            </button>
          </form>
        ))}
      </PageSection>

      {/* What I am on */}
      <PageSection title="On my table">
        {!current ? (
          <p className="text-sm text-stone-400">
            {me.presence === StaffPresence.READY
              ? "Nothing yet — the dashboard will suggest the next pet."
              : "Nothing right now."}
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-lg font-black text-stone-900">
              <Link href={`/staff/appointments/${current.id}`} className="hover:text-amber-700">
                {current.pet.name}
              </Link>
              {current.pet.hasBiteHistory && (
                <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold align-middle">
                  BITE
                </span>
              )}
              <span className="ml-2 text-sm font-medium text-stone-500">
                {current.customer.firstName} {current.customer.lastName}
              </span>
            </p>
            <p className="text-sm text-stone-600">
              {current.services.length > 0
                ? current.services
                    .map((line) => line.service?.name ?? formatServiceType(line.serviceType))
                    .join(", ")
                : formatServiceType(current.serviceType)}
              {current.station && (
                <span className="text-stone-400"> · {current.station.name}</span>
              )}
            </p>
            {current.pet.groomingNotes && (
              <p className="text-sm text-stone-700 bg-stone-50 border border-stone-200 rounded-lg p-2 whitespace-pre-wrap">
                {current.pet.groomingNotes}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  current.status === AppointmentStatus.COMPLETE
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {formatStatus(current.status)}
              </span>
              {step && (
                <form action={moveStatus}>
                  <input type="hidden" name="appointmentId" value={current.id} />
                  <input type="hidden" name="status" value={step} />
                  <button
                    type="submit"
                    className="bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 rounded-lg text-sm font-bold"
                  >
                    → {formatStatus(step)}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </PageSection>

      {/* The rest of my week */}
      {week.length > 0 && (
        <PageSection title="My week">
          <ul className="divide-y divide-stone-100 text-sm">
            {week.map((shift) => (
              <li key={shift.id} className="py-1.5 flex items-center justify-between gap-3">
                <span className="text-stone-700">
                  {formatShopDate(shift.startsAt, { weekday: "long", month: "short", day: "numeric" })}
                </span>
                <span className="text-stone-500 whitespace-nowrap">
                  {formatShopTime(shift.startsAt)} – {formatShopTime(shift.endsAt)}
                </span>
              </li>
            ))}
          </ul>
        </PageSection>
      )}

      {/* What is coming to me */}
      <PageSection title={`Mine today (${mine.length})`} grow scroll>
        {upNext.length === 0 ? (
          <p className="text-sm text-stone-400">Nothing else assigned to you today.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {upNext.map((visit) => (
              <li key={visit.id} className="py-1.5 flex items-center justify-between gap-3">
                <Link
                  href={`/staff/appointments/${visit.id}`}
                  className="truncate hover:text-amber-700"
                >
                  <span className="font-semibold text-stone-900">{visit.pet.name}</span>
                  <span className="text-stone-500"> · {visit.customer.lastName}</span>
                </Link>
                <span className="text-xs text-stone-400 whitespace-nowrap">
                  {formatShopTime(visit.scheduledAt)} · {formatStatus(visit.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </PageShell>
  );
}
