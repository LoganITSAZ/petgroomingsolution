import Link from "next/link";
import { calendarWeeks, unitBounds } from "@/lib/calendar-grid";
import { formatShopDate, formatShopTime, shopDayKey, statusBadgeClass } from "@/lib/utils";

/**
 * A week or a month of booked visits, laid out as the shop pictures it.
 *
 * It is a second view over rows the list already queried — no new query, no
 * client JavaScript — so the grid is a plain table of day cells and every chip
 * is a link to the visit. A day header links to that day's list, which is where
 * the stage moves and the check-in live: a cell four inches wide is not a place
 * to advance anybody.
 */
export interface CalendarVisit {
  id: string;
  scheduledAt: Date;
  status: string;
  petName: string;
  staffName: string | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AppointmentCalendar({
  anchorKey,
  unit,
  visits,
  dayHref,
}: {
  anchorKey: string;
  unit: "week" | "month";
  visits: CalendarVisit[];
  dayHref: (dayKey: string) => string;
}) {
  const weeks = calendarWeeks(anchorKey, unit);
  const { first, last } = unitBounds(anchorKey, unit);
  const todayKey = shopDayKey();

  // Bucketed by shop day, because a 7pm visit in a UTC server's day is the
  // evening of the day before.
  const byDay = new Map<string, CalendarVisit[]>();
  for (const visit of visits) {
    const key = shopDayKey(visit.scheduledAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(visit);
    else byDay.set(key, [visit]);
  }

  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <thead>
        <tr className="bg-well text-stone-500 text-[10px] tracking-tight">
          {WEEKDAYS.map((day) => (
            <th key={day} scope="col" className="px-2 py-1.5 font-semibold">
              {day}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]} className="align-top">
            {week.map((dayKey) => {
              const inUnit = dayKey >= first && dayKey <= last;
              const dayVisits = byDay.get(dayKey) ?? [];
              return (
                <td
                  key={dayKey}
                  className={`border border-well-line px-1.5 py-1.5 ${
                    unit === "week" ? "h-72" : "h-28"
                  } ${inUnit ? "" : "bg-well text-stone-400"}`}
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <Link
                      href={dayHref(dayKey)}
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                        dayKey === todayKey
                          ? "bg-stone-800 text-white"
                          : inUnit
                            ? "text-stone-700 hover:bg-well"
                            : "text-stone-400 hover:bg-white"
                      }`}
                      aria-label={`Visits on ${formatShopDate(new Date(`${dayKey}T12:00:00Z`), {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}`}
                    >
                      {Number(dayKey.slice(8))}
                    </Link>
                    {dayVisits.length > 0 && (
                      <span className="text-[10px] font-semibold text-stone-400">
                        {dayVisits.length}
                      </span>
                    )}
                  </div>

                  <ul className="mt-1 space-y-0.5 overflow-hidden">
                    {dayVisits.map((visit) => (
                      <li key={visit.id}>
                        <Link
                          href={`/staff/appointments/${visit.id}`}
                          title={`${formatShopTime(visit.scheduledAt)} · ${visit.petName}${
                            visit.staffName ? ` · ${visit.staffName}` : ""
                          }`}
                          className={`block truncate rounded px-1 py-0.5 text-[11px] leading-tight hover:underline ${statusBadgeClass(
                            visit.status
                          )}`}
                        >
                          <span className="font-semibold">{formatShopTime(visit.scheduledAt)}</span>{" "}
                          {visit.petName}
                          {unit === "week" && visit.staffName && (
                            <span className="block text-[10px] opacity-70">{visit.staffName}</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
