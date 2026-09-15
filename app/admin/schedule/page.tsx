import { prisma } from "@/lib/prisma";
import { StaffRole } from "@prisma/client";
import Link from "next/link";
import {
  HOURS_LEVEL_CLASS,
  HOURS_LEVEL_LABEL,
  formatHours,
  hoursByStaff,
  scheduleAdvice,
  shiftsBetween,
  weekDays,
} from "@/lib/schedule";
import { getConfig } from "@/lib/config";
import { formatShopDate, formatShopTime24, shopDayKey } from "@/lib/utils";
import { deleteShift, generateWeek, saveShift } from "./actions";
import ScheduleWeekSync from "./ScheduleWeekSync";
import { PageShell, PageSection } from "@/components/ui";
import SaveToast from "@/components/SaveToast";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Edit Schedule" };

/**
 * The week's rota: staff down the side, days across. Shifts are edited in
 * place, and a whole week can be laid down from one pattern.
 *
 * Staff read the same week at /staff/schedule; editing is what stays here.
 * Above the grid sits what an admin would otherwise have to add up by hand —
 * overtime, days the shop opens with nobody on, cover against what is booked.
 * Every line carries its numbers so the reader can check it.
 */

const ERRORS: Record<string, string> = {
  incomplete: "Pick a person, a day and both times.",
  bad_time: "Those times could not be read.",
  backwards: "A shift has to end after it starts.",
};

const DAY_MS = 24 * 60 * 60 * 1000;

const ADVICE_GROUPS = [
  { scope: "days", label: "Cover" },
  { scope: "people", label: "People" },
] as const;

interface PageProps {
  searchParams: Promise<{
    week?: string;
    saved?: string;
    deleted?: string;
    generated?: string;
    error?: string;
  }>;
}

export default async function SchedulePage(props: PageProps) {
  const searchParams = await props.searchParams;
  // The week is anchored on a day key so paging is stable across timezones.
  const anchor = searchParams.week ? new Date(`${searchParams.week}T12:00:00Z`) : new Date();
  const days = weekDays(anchor);
  const weekStart = days[0];
  const weekEnd = new Date(days[6].getTime() + DAY_MS);
  const weekKey = shopDayKey(weekStart);

  const [staff, shifts, config] = await Promise.all([
    prisma.staff.findMany({
      where: { isActive: true, roles: { hasSome: [StaffRole.GROOMER, StaffRole.BATHER] } },
      select: { id: true, name: true, roles: true },
      orderBy: { name: "asc" },
    }),
    shiftsBetween(weekStart, weekEnd),
    getConfig(),
  ]);

  const hours = hoursByStaff(staff, shifts, weekStart, weekEnd, config.overtimeWeeklyHours);
  const hoursByStaffId = new Map(hours.map((row) => [row.staffId, row]));
  const advice = await scheduleAdvice({
    days,
    shifts,
    staff,
    businessHours: (config.businessHours as Record<string, { open: string; close: string } | null>) ?? {},
    overtimeHours: config.overtimeWeeklyHours,
  });

  const byStaffDay = new Map<string, typeof shifts>();
  for (const shift of shifts) {
    const key = `${shift.staffId}|${shopDayKey(shift.startsAt)}`;
    byStaffDay.set(key, [...(byStaffDay.get(key) ?? []), shift]);
  }

  const warnCount = advice.filter((item) => item.tone === "warn").length;
  // A day's problems are marked on its column too, so the grid says where to look.
  const adviceByDay = new Map<string, typeof advice>();
  for (const item of advice) {
    if (item.day) adviceByDay.set(item.day, [...(adviceByDay.get(item.day) ?? []), item]);
  }

  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const prevWeek = shopDayKey(new Date(weekStart.getTime() - 7 * DAY_MS));
  const nextWeek = shopDayKey(new Date(weekStart.getTime() + 7 * DAY_MS));
  const inputClass =
    "w-full border border-stone-200 rounded px-1.5 py-1 text-xs ";

  return (
    <PageShell
      title="Edit Schedule"
      subtitle={
        <>
          {shifts.length} shift{shifts.length !== 1 ? "s" : ""} this week across {staff.length}{" "}
          groomers and bathers. Staff read the same week at{" "}
          <Link href="/staff/schedule" className="text-amber-700 hover:text-amber-900 underline">
            /staff/schedule
          </Link>
          .
        </>
      }
      actions={
        <>
          <Link
            href={`/admin/schedule?week=${prevWeek}`}
            className="px-2 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-sm"
          >
            ←
          </Link>
          <span className="text-sm font-semibold text-stone-800">
            {formatShopDate(weekStart, { month: "short", day: "numeric" })} –{" "}
            {formatShopDate(days[6], { month: "short", day: "numeric" })}
          </span>
          <Link
            href={`/admin/schedule?week=${nextWeek}`}
            className="px-2 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-sm"
          >
            →
          </Link>
        </>
      }
    >

      {(searchParams.saved || searchParams.deleted || searchParams.generated) && (
        <SaveToast>
          {searchParams.generated ? "Week filled from the pattern." : "Schedule updated."}
        </SaveToast>
      )}
      {errorMessage && (
        <SaveToast tone="error">
          {errorMessage}
        </SaveToast>
      )}

      {/* What to look at before this week is worked */}
      <PageSection
        title="Scheduling check"
        hint={
          advice.length === 0
            ? `Overtime past ${config.overtimeWeeklyHours}h/week`
            : `${warnCount} to fix, ${advice.length - warnCount} to watch`
        }
      >
        {advice.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing to flag: every open day is covered, nobody is scheduled into overtime, and no
            day is short-handed against what is booked.
          </p>
        ) : (
          // Grouped by what the reader would act on — a day's cover is fixed in
          // a column, a person's week across a row — rather than one long stack.
          <div className="grid gap-3 md:grid-cols-2">
            {ADVICE_GROUPS.map(({ scope, label }) => {
              // Worst first: a day nobody is on outranks a day that looks thin.
              const items = advice
                .filter((item) => item.scope === scope)
                .sort((a, b) => Number(b.tone === "warn") - Number(a.tone === "warn"));
              if (items.length === 0) return null;
              return (
                <section key={scope}>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted mb-1">
                    {label} ({items.length})
                  </h3>
                  <ul className="rounded-lg border border-well-line bg-well divide-y divide-well-line">
                    {items.map((item) => (
                      <li key={item.id} className="flex gap-2 px-2.5 py-1.5">
                        <span
                          aria-hidden
                          className={`mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full ${
                            item.tone === "warn" ? "bg-red-500" : "bg-amber-400"
                          }`}
                        />
                        <p className="text-[13px] leading-snug text-stone-800">
                          <span className="sr-only">{item.tone === "warn" ? "Fix: " : "Watch: "}</span>
                          <span className="font-semibold">{item.title}.</span>{" "}
                          {/* The numbers behind the claim — never a bare assertion. */}
                          <span className="text-muted">{item.evidence}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-3 pt-2 border-t border-well-line flex flex-wrap gap-1.5">
          {hours.map((row) => (
            <span
              key={row.staffId}
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${HOURS_LEVEL_CLASS[row.level]}`}
              title={`${row.staffName}: ${HOURS_LEVEL_LABEL[row.level]}`}
            >
              {row.staffName} {formatHours(row.minutes)}
            </span>
          ))}
        </div>
      </PageSection>

      {/* Lay down a whole week at once */}
      <details className="border-t border-stone-100">
        <summary className="px-3 py-2 cursor-pointer text-sm font-semibold text-stone-800">
          Fill the week from a pattern
        </summary>
        <form action={generateWeek} className="px-3 pb-3 pt-1 border-t border-stone-100 space-y-3">
          <input type="hidden" name="week" value={weekKey} />

          <div>
            <p className="text-xs font-bold text-stone-500 tracking-tight mb-1">Who</p>
            <div className="flex flex-wrap gap-2">
              {staff.map((member) => (
                <label key={member.id} className="flex items-center gap-1.5 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    name="staffIds"
                    value={member.id}
                    className="accent-amber-700"
                  />
                  {member.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-stone-500 tracking-tight mb-1">Days</p>
            <div className="flex flex-wrap gap-2">
              {days.map((day) => (
                <label
                  key={day.toISOString()}
                  className="flex items-center gap-1.5 text-sm text-stone-700"
                >
                  <input
                    type="checkbox"
                    name="days"
                    value={shopDayKey(day)}
                    defaultChecked={![0, 6].includes(day.getUTCDay())}
                    className="accent-amber-700"
                  />
                  {formatShopDate(day, { weekday: "short" })}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-stone-500 mb-1">From</span>
              <input type="time" name="start" aria-label="New shift start" defaultValue="08:00" className={inputClass} />
            </label>
            <label className="text-sm">
              <span className="block text-stone-500 mb-1">To</span>
              <input type="time" name="end" aria-label="New shift end" defaultValue="17:00" className={inputClass} />
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" name="replace" className="accent-amber-700" />
              Replace shifts already there
            </label>
            <button
              type="submit"
              className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-1.5 rounded-lg text-sm font-semibold ml-auto"
            >
              Fill week
            </button>
          </div>
        </form>
      </details>

      {/* The grid */}
      {staff.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          No groomers or bathers to schedule.
        </PageSection>
      ) : (
        <PageSection grow scroll padded={false} bodyClassName="overflow-auto">
          <ScheduleWeekSync>
          <table className="w-full text-sm">
            <thead className="bg-well text-stone-500 text-[10px] tracking-tight">
              <tr>
                <th scope="col" className="px-3 py-2 text-left sticky left-0 bg-stone-50">Staff</th>
                {days.map((day) => {
                  const flags = adviceByDay.get(shopDayKey(day)) ?? [];
                  return (
                    <th scope="col" key={day.toISOString()} className="px-2 py-2 text-left whitespace-nowrap">
                      {formatShopDate(day, { weekday: "short", day: "numeric" })}
                      {flags.length > 0 && (
                        <span
                          className={
                            flags.some((item) => item.tone === "warn") ? "ml-1 text-red-500" : "ml-1 text-amber-500"
                          }
                          title={flags.map((item) => item.title).join("\n")}
                        >
                          ●
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {staff.map((member) => (
                <tr key={member.id} className="align-top" data-staff={member.id}>
                  <td className="px-3 py-2 font-semibold text-stone-900 whitespace-nowrap sticky left-0 bg-white">
                    {member.name}
                    <label className="flex items-center gap-1 text-[10px] font-normal text-stone-400">
                      <input type="checkbox" data-role="row-sync-toggle" className="accent-amber-700" />
                      Same time every day
                    </label>
                    <span className="block text-[10px] font-normal text-stone-400">
                      {member.roles.map((role) => role.toLowerCase()).join(" · ")}
                    </span>
                    {(() => {
                      const row = hoursByStaffId.get(member.id);
                      return row ? (
                        <span
                          className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${HOURS_LEVEL_CLASS[row.level]}`}
                        >
                          {formatHours(row.minutes)}
                        </span>
                      ) : null;
                    })()}
                  </td>
                  {days.map((day) => {
                    const dayKey = shopDayKey(day);
                    const cell = byStaffDay.get(`${member.id}|${dayKey}`) ?? [];

                    return (
                      <td key={dayKey} className="px-2 py-2 min-w-[9rem]">
                        {cell.map((shift) => (
                          <div key={shift.id} className="mb-1">
                            <form action={saveShift} className="flex items-center gap-1">
                              <input type="hidden" name="week" value={weekKey} />
                              <input type="hidden" name="id" value={shift.id} />
                              <input type="hidden" name="staffId" value={member.id} />
                              <input type="hidden" name="day" value={dayKey} />
                              <input
                                type="time"
                                name="start"
                                aria-label="Shift start"
                                defaultValue={formatShopTime24(shift.startsAt)}
                                className={inputClass}
                              />
                              <input
                                type="time"
                                name="end"
                                aria-label="Shift end"
                                defaultValue={formatShopTime24(shift.endsAt)}
                                className={inputClass}
                              />
                              <button
                                type="submit"
                                className="text-[11px] font-semibold text-amber-700 hover:text-amber-900"
                              >
                                ✓
                              </button>
                            </form>
                            <form action={deleteShift}>
                              <input type="hidden" name="week" value={weekKey} />
                              <input type="hidden" name="id" value={shift.id} />
                              <button
                                type="submit"
                                className="text-[10px] text-stone-400 hover:text-red-600"
                              >
                                remove
                              </button>
                            </form>
                          </div>
                        ))}

                        {cell.length === 0 && (
                          <form action={saveShift} className="flex items-center gap-1">
                            <input type="hidden" name="week" value={weekKey} />
                            <input type="hidden" name="staffId" value={member.id} />
                            <input type="hidden" name="day" value={dayKey} />
                            <input
                              type="time"
                              name="start"
                              data-role="empty-start"
                              defaultValue="08:00"
                              className={inputClass}
                            />
                            <input
                              type="time"
                              name="end"
                              data-role="empty-end"
                              defaultValue="17:00"
                              className={inputClass}
                            />
                            <button
                              type="submit"
                              className="text-[11px] font-semibold text-stone-400 hover:text-amber-700"
                            >
                              +
                            </button>
                          </form>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </ScheduleWeekSync>
        </PageSection>
      )}
    </PageShell>
  );
}
