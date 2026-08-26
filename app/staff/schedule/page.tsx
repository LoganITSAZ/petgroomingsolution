import { prisma } from "@/lib/prisma";
import { StaffRole } from "@prisma/client";
import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";
import { auth } from "@/lib/auth";
import { currentStaffIsAdmin } from "@/lib/staff-roles";
import { getConfig } from "@/lib/config";
import {
  HOURS_LEVEL_CLASS,
  HOURS_LEVEL_LABEL,
  describeShifts,
  formatHours,
  hoursByStaff,
  shiftsBetween,
  weekDays,
} from "@/lib/schedule";
import { formatShopDate, formatShopTime, shopDayKey } from "@/lib/utils";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Schedule" };

/**
 * The rota, readable by anyone on the staff.
 *
 * A groomer needs to know when they are on and who they are on with; that is
 * not an admin question. Editing still is — this screen has no controls, and
 * admins get a link across to the editor.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

interface PageProps {
  searchParams: { week?: string };
}

export default async function StaffSchedulePage({ searchParams }: PageProps) {
  const session = await auth();
  const meId = session?.user?.id;

  // The week is anchored on a day key so paging is stable across timezones.
  const anchor = searchParams.week ? new Date(`${searchParams.week}T12:00:00Z`) : new Date();
  const days = weekDays(anchor);
  const weekStart = days[0];
  const weekEnd = new Date(days[6].getTime() + DAY_MS);
  const todayKey = shopDayKey(new Date());

  const [staff, shifts, config, isAdmin] = await Promise.all([
    prisma.staff.findMany({
      where: { isActive: true, roles: { hasSome: [StaffRole.GROOMER, StaffRole.BATHER] } },
      select: { id: true, name: true, roles: true },
      orderBy: { name: "asc" },
    }),
    shiftsBetween(weekStart, weekEnd),
    getConfig(),
    currentStaffIsAdmin(),
  ]);

  const byStaffDay = new Map<string, typeof shifts>();
  for (const shift of shifts) {
    const key = `${shift.staffId}|${shopDayKey(shift.startsAt)}`;
    byStaffDay.set(key, [...(byStaffDay.get(key) ?? []), shift]);
  }

  const hours = hoursByStaff(staff, shifts, weekStart, weekEnd, config.overtimeWeeklyHours);
  const hoursByStaffId = new Map(hours.map((row) => [row.staffId, row]));
  const mine = meId ? hoursByStaffId.get(meId) : undefined;
  const myShifts = meId ? shifts.filter((shift) => shift.staffId === meId) : [];

  const prevWeek = shopDayKey(new Date(weekStart.getTime() - 7 * DAY_MS));
  const nextWeek = shopDayKey(new Date(weekStart.getTime() + 7 * DAY_MS));

  return (
    <PageShell
      title="Schedule"
      subtitle={
        <>
          Who is on this week, across {staff.length} groomer{staff.length === 1 ? "" : "s"} and
          bathers.
          {isAdmin && (
            <>
              {" "}
              <Link
                href={`/admin/schedule?week=${shopDayKey(weekStart)}`}
                className="text-amber-700 hover:text-amber-900 underline"
              >
                Edit this week
              </Link>
            </>
          )}
        </>
      }
      actions={
        <>
          <Link
            href={`/staff/schedule?week=${prevWeek}`}
            aria-label="Previous week"
            className="px-2 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-sm"
          >
            ←
          </Link>
          <span className="text-sm font-semibold text-stone-800">
            {formatShopDate(weekStart, { month: "short", day: "numeric" })} –{" "}
            {formatShopDate(days[6], { month: "short", day: "numeric" })}
          </span>
          <Link
            href={`/staff/schedule?week=${nextWeek}`}
            aria-label="Next week"
            className="px-2 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-sm"
          >
            →
          </Link>
        </>
      }
    >
      {/* Your own week first — it is why most people open this page. */}
      {mine && (
        <PageSection tone="muted">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">Your week</p>
              <p className="text-lg font-bold text-stone-900 mt-0.5">
                {formatHours(mine.minutes)} over {mine.daysWorked} day
                {mine.daysWorked === 1 ? "" : "s"}
              </p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${HOURS_LEVEL_CLASS[mine.level]}`}>
              {HOURS_LEVEL_LABEL[mine.level]}
            </span>
          </div>
          {myShifts.length > 0 && (
            <ul className="mt-2 pt-2 border-t border-stone-100 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-sm">
              {myShifts.map((shift) => (
                <li
                  key={shift.id}
                  className={`flex justify-between gap-3 ${
                    shopDayKey(shift.startsAt) === todayKey ? "font-semibold text-stone-900" : "text-stone-600"
                  }`}
                >
                  <span>{formatShopDate(shift.startsAt, { weekday: "short", day: "numeric" })}</span>
                  <span>
                    {formatShopTime(shift.startsAt)} – {formatShopTime(shift.endsAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      )}

      {staff.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          Nobody is on the rota yet.
        </PageSection>
      ) : (
        <PageSection grow scroll padded={false} bodyClassName="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Shifts for the week of {formatShopDate(weekStart, { month: "long", day: "numeric" })}
            </caption>
            <thead className="bg-well text-stone-500 text-[10px] uppercase tracking-widest">
              <tr>
                <th scope="col" className="px-3 py-2 text-left sticky left-0 bg-stone-50">
                  Staff
                </th>
                {days.map((day) => {
                  const isToday = shopDayKey(day) === todayKey;
                  return (
                    <th
                      scope="col"
                      key={day.toISOString()}
                      className={`px-2 py-2 text-left whitespace-nowrap ${
                        isToday ? "text-amber-800 bg-amber-50" : ""
                      }`}
                    >
                      {formatShopDate(day, { weekday: "short", day: "numeric" })}
                      {isToday && <span className="sr-only"> (today)</span>}
                    </th>
                  );
                })}
                <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
                  Hours
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {staff.map((member) => {
                const row = hoursByStaffId.get(member.id);
                const isMe = member.id === meId;

                return (
                  <tr key={member.id} className={`align-top ${isMe ? "bg-amber-50/60" : ""}`}>
                    <td
                      className={`px-3 py-2 font-semibold text-stone-900 whitespace-nowrap sticky left-0 ${
                        isMe ? "bg-amber-50" : "bg-white"
                      }`}
                    >
                      {member.name}
                      {isMe && <span className="text-amber-700 font-normal"> (you)</span>}
                      <span className="block text-[10px] font-normal text-stone-400">
                        {member.roles.map((role) => role.toLowerCase()).join(" · ")}
                      </span>
                    </td>

                    {days.map((day) => {
                      const dayKey = shopDayKey(day);
                      const cell = byStaffDay.get(`${member.id}|${dayKey}`) ?? [];
                      const isToday = dayKey === todayKey;

                      return (
                        <td
                          key={dayKey}
                          className={`px-2 py-2 min-w-[7rem] ${isToday ? "bg-amber-50/60" : ""}`}
                        >
                          {cell.length === 0 ? (
                            <span className="text-stone-300">—</span>
                          ) : (
                            <span className="text-stone-700 whitespace-nowrap">
                              {describeShifts(cell)}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {row && (
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${HOURS_LEVEL_CLASS[row.level]}`}
                          title={HOURS_LEVEL_LABEL[row.level]}
                        >
                          {formatHours(row.minutes)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </PageSection>
      )}

      <p className="border-t border-stone-100 px-3 py-2 text-xs text-stone-500">
        Hours are what is scheduled, not what was worked — a week reads as overtime past{" "}
        {config.overtimeWeeklyHours}h, set in Shop Settings.
      </p>
    </PageShell>
  );
}
