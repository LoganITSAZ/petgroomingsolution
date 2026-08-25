import { prisma } from "@/lib/prisma";
import { StaffPresence } from "@prisma/client";
import { SHOP_TIMEZONE, formatShopDate, formatShopTime, shopDayKey, shopDayRange } from "@/lib/utils";
import { shopMoment } from "@/lib/shop-time";

/**
 * Who is scheduled, and whether the floor matches the roster.
 *
 * Shifts are concrete dated rows rather than a recurrence pattern: the shop
 * edits individual days constantly, and every screen wants "who is on today",
 * not "what the rule says".
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Shift {
  id: string;
  staffId: string;
  staffName: string;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
}

/** Shifts overlapping a window, earliest first. */
export async function shiftsBetween(start: Date, end: Date): Promise<Shift[]> {
  const rows = await prisma.staffShift.findMany({
    where: { startsAt: { lt: end }, endsAt: { gt: start } },
    include: { staff: { select: { name: true } } },
    orderBy: [{ startsAt: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    staffId: row.staffId,
    staffName: row.staff.name,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    note: row.note,
  }));
}

/** Today's shifts, keyed by staff id — a person can have more than one. */
export async function todaysShifts(now: Date = new Date()): Promise<Map<string, Shift[]>> {
  const { start, end } = shopDayRange(now);
  const shifts = await shiftsBetween(start, end);

  const byStaff = new Map<string, Shift[]>();
  for (const shift of shifts) {
    byStaff.set(shift.staffId, [...(byStaff.get(shift.staffId) ?? []), shift]);
  }
  return byStaff;
}

export function isOnShiftNow(shifts: Shift[] | undefined, now: Date = new Date()): boolean {
  return (shifts ?? []).some((shift) => shift.startsAt <= now && shift.endsAt > now);
}

/** "8:00 AM – 5:00 PM", or several ranges when the day is split. */
export function describeShifts(shifts: Shift[] | undefined): string | null {
  if (!shifts || shifts.length === 0) return null;
  return shifts
    .map((shift) => `${formatShopTime(shift.startsAt)} – ${formatShopTime(shift.endsAt)}`)
    .join(", ");
}

export interface ScheduleGap {
  staffId: string;
  staffName: string;
  kind: "expected" | "unscheduled";
  detail: string;
}

/**
 * Where the schedule and the floor disagree: scheduled but not signed in, or
 * working without a shift. Both are worth knowing, neither is an error.
 */
export async function scheduleGaps(now: Date = new Date()): Promise<ScheduleGap[]> {
  const [shifts, staff] = await Promise.all([
    todaysShifts(now),
    prisma.staff.findMany({
      where: { isActive: true, roles: { hasSome: ["GROOMER", "BATHER"] } },
      select: { id: true, name: true, presence: true },
    }),
  ]);

  const gaps: ScheduleGap[] = [];

  for (const member of staff) {
    const mine = shifts.get(member.id);
    const onShift = isOnShiftNow(mine, now);
    const signedIn = member.presence !== StaffPresence.OFF_SHIFT;

    if (onShift && !signedIn) {
      gaps.push({
        staffId: member.id,
        staffName: member.name,
        kind: "expected",
        detail: `scheduled ${describeShifts(mine)} and not signed in`,
      });
    } else if (!onShift && signedIn) {
      gaps.push({
        staffId: member.id,
        staffName: member.name,
        kind: "unscheduled",
        detail: mine && mine.length > 0 ? "signed in outside their shift" : "signed in with no shift today",
      });
    }
  }

  return gaps;
}

/** The seven days of the week a schedule grid shows, starting Monday. */
export function weekDays(anchor: Date = new Date()): Date[] {
  const { start } = shopDayRange(anchor);
  // Monday-first, computed from the shop's own day.
  const weekday = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: SHOP_TIMEZONE, weekday: "short" })
      .format(start)
      .replace(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/, (day) =>
        String(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(day))
      )
  );

  const monday = shopDayRange(new Date(start.getTime() - weekday * DAY_MS)).start;
  return Array.from({ length: 7 }, (_, offset) =>
    shopDayRange(new Date(monday.getTime() + offset * DAY_MS)).start
  );
}

export { shopDayKey };

/* ────────────────────────────────────────────────────────────────────────────
 * Hours, overtime and coverage
 *
 * A rota is easy to fill and hard to read: nobody notices the sixth day in a
 * row, or that Tuesday opens with nobody on. These derive what an admin would
 * otherwise have to add up by hand, and every line carries the numbers behind
 * it so the reader can check the claim rather than trust it.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Hours a person is scheduled for over a window. */
export interface StaffWeekHours {
  staffId: string;
  staffName: string;
  minutes: number;
  shifts: number;
  daysWorked: number;
  /** Longest run of consecutive scheduled days inside the window. */
  longestRun: number;
  level: "none" | "under" | "approaching" | "overtime";
}

const MIN_MS = 60 * 1000;

/** Minutes of a shift that fall inside a window — a shift may straddle it. */
function minutesWithin(shift: Shift, start: Date, end: Date): number {
  const from = Math.max(shift.startsAt.getTime(), start.getTime());
  const to = Math.min(shift.endsAt.getTime(), end.getTime());
  return Math.max(0, Math.round((to - from) / MIN_MS));
}

export function formatHours(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${whole}h` : `${whole}h ${rest}m`;
}

/**
 * Scheduled hours per person for the window, with an overtime reading.
 *
 * Overtime is scheduled hours, not worked hours — the point is to see it
 * before the week happens, while the rota can still be changed. Presence
 * events are what actually happened.
 */
export function hoursByStaff(
  staff: { id: string; name: string }[],
  shifts: Shift[],
  windowStart: Date,
  windowEnd: Date,
  overtimeHours: number
): StaffWeekHours[] {
  const overtimeMins = overtimeHours * 60;
  // Within four hours of the threshold is close enough to be worth saying.
  const approachingMins = Math.max(0, overtimeMins - 4 * 60);

  return staff.map((member) => {
    const mine = shifts.filter((shift) => shift.staffId === member.id);
    const minutes = mine.reduce((sum, shift) => sum + minutesWithin(shift, windowStart, windowEnd), 0);
    const dayKeys = new Set(mine.map((shift) => shopDayKey(shift.startsAt)));

    return {
      staffId: member.id,
      staffName: member.name,
      minutes,
      shifts: mine.length,
      daysWorked: dayKeys.size,
      longestRun: longestConsecutiveRun(dayKeys),
      level:
        minutes === 0
          ? "none"
          : minutes > overtimeMins
            ? "overtime"
            : minutes >= approachingMins
              ? "approaching"
              : "under",
    };
  });
}

/** Longest run of consecutive calendar days in a set of day keys. */
function longestConsecutiveRun(dayKeys: Set<string>): number {
  const sorted = [...dayKeys].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;

  for (const key of sorted) {
    const [year, month, day] = key.split("-").map(Number);
    const stamp = Date.UTC(year, month - 1, day);
    run = previous !== null && stamp - previous === DAY_MS ? run + 1 : 1;
    previous = stamp;
    best = Math.max(best, run);
  }
  return best;
}

export const HOURS_LEVEL_CLASS: Record<StaffWeekHours["level"], string> = {
  none: "bg-stone-100 text-stone-500",
  under: "bg-green-100 text-green-700",
  approaching: "bg-amber-100 text-amber-800",
  overtime: "bg-red-100 text-red-700",
};

export const HOURS_LEVEL_LABEL: Record<StaffWeekHours["level"], string> = {
  none: "No shifts",
  under: "Within hours",
  approaching: "Near overtime",
  overtime: "Overtime",
};

export interface ScheduleAdvice {
  id: string;
  tone: "warn" | "info";
  title: string;
  /** The numbers behind the claim. Never ship one without them. */
  evidence: string;
}

type DayHours = { open: string; close: string } | null;
type BusinessHours = Record<string, DayHours>;

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** The shop's opening hours for a given day, or null when it is closed. */
function hoursFor(businessHours: BusinessHours, day: Date): DayHours {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: SHOP_TIMEZONE, weekday: "long" })
    .format(day)
    .toLowerCase();
  return businessHours[name] ?? businessHours[WEEKDAY_KEYS[day.getUTCDay()]] ?? null;
}

/**
 * What an admin should look at before publishing the week: overtime, days the
 * shop opens with nobody on, thin cover against what is actually booked, runs
 * of days without a break, and anyone left off the rota entirely.
 */
export async function scheduleAdvice({
  days,
  shifts,
  staff,
  businessHours,
  overtimeHours,
}: {
  days: Date[];
  shifts: Shift[];
  staff: { id: string; name: string }[];
  businessHours: BusinessHours;
  overtimeHours: number;
}): Promise<ScheduleAdvice[]> {
  const advice: ScheduleAdvice[] = [];
  const weekStart = days[0];
  const weekEnd = new Date(days[days.length - 1].getTime() + DAY_MS);

  // ── Overtime and near-overtime, worst first ───────────────
  const hours = hoursByStaff(staff, shifts, weekStart, weekEnd, overtimeHours);
  for (const row of [...hours].sort((a, b) => b.minutes - a.minutes)) {
    if (row.level === "overtime") {
      advice.push({
        id: `overtime-${row.staffId}`,
        tone: "warn",
        title: `${row.staffName} is scheduled into overtime`,
        evidence: `${formatHours(row.minutes)} across ${row.shifts} shift${row.shifts === 1 ? "" : "s"}, against a ${overtimeHours}h week — ${formatHours(row.minutes - overtimeHours * 60)} over.`,
      });
    } else if (row.level === "approaching") {
      advice.push({
        id: `near-overtime-${row.staffId}`,
        tone: "info",
        title: `${row.staffName} is close to overtime`,
        evidence: `${formatHours(row.minutes)} scheduled, ${formatHours(overtimeHours * 60 - row.minutes)} short of the ${overtimeHours}h week.`,
      });
    }
  }

  // ── Six or seven days without a day off ───────────────────
  for (const row of hours) {
    if (row.longestRun >= 6) {
      advice.push({
        id: `run-${row.staffId}`,
        tone: "warn",
        title: `${row.staffName} works ${row.longestRun} days in a row`,
        evidence: `Scheduled on ${row.daysWorked} of the 7 days shown, with no break across ${row.longestRun} of them.`,
      });
    }
  }

  // ── Nobody on while the shop is open ──────────────────────
  const openDays = days.filter((day) => hoursFor(businessHours, day) !== null);
  for (const day of openDays) {
    const open = hoursFor(businessHours, day)!;
    const dayKey = shopDayKey(day);
    const opensAt = shopMoment(dayKey, open.open);
    const closesAt = shopMoment(dayKey, open.close);
    const onThatDay = shifts.filter(
      (shift) => shift.startsAt < closesAt && shift.endsAt > opensAt
    );
    const label = formatShopDate(day, { weekday: "long" });

    if (onThatDay.length === 0) {
      advice.push({
        id: `empty-${dayKey}`,
        tone: "warn",
        title: `Nobody is scheduled ${label}`,
        evidence: `The shop is open ${open.open}–${open.close} with no shifts on the rota.`,
      });
      continue;
    }

    const firstIn = new Date(Math.min(...onThatDay.map((shift) => shift.startsAt.getTime())));
    const lastOut = new Date(Math.max(...onThatDay.map((shift) => shift.endsAt.getTime())));

    if (firstIn > opensAt) {
      advice.push({
        id: `late-open-${dayKey}`,
        tone: "warn",
        title: `${label} opens with nobody on`,
        evidence: `Doors open ${open.open}; the first shift starts ${formatShopTime(firstIn)}.`,
      });
    }
    if (lastOut < closesAt) {
      advice.push({
        id: `early-close-${dayKey}`,
        tone: "warn",
        title: `${label} is uncovered before closing`,
        evidence: `The last shift ends ${formatShopTime(lastOut)}; the shop closes ${open.close}.`,
      });
    }
  }

  // ── Cover against what is actually booked ─────────────────
  const booked = await prisma.appointment.groupBy({
    by: ["scheduledAt"],
    where: { scheduledAt: { gte: weekStart, lt: weekEnd } },
    _count: { _all: true },
  });

  const bookedPerDay = new Map<string, number>();
  for (const row of booked) {
    const key = shopDayKey(row.scheduledAt);
    bookedPerDay.set(key, (bookedPerDay.get(key) ?? 0) + row._count._all);
  }

  for (const day of days) {
    const dayKey = shopDayKey(day);
    const pets = bookedPerDay.get(dayKey) ?? 0;
    if (pets === 0) continue;

    const people = new Set(
      shifts.filter((shift) => shopDayKey(shift.startsAt) === dayKey).map((shift) => shift.staffId)
    ).size;

    // Six pets per person in a day is a full day's work for one groomer.
    if (people === 0 || pets / people > 6) {
      advice.push({
        id: `thin-${dayKey}`,
        tone: people === 0 ? "warn" : "info",
        title:
          people === 0
            ? `${pets} booked ${formatShopDate(day, { weekday: "long" })} with nobody scheduled`
            : `${formatShopDate(day, { weekday: "long" })} looks thin`,
        evidence: `${pets} pet${pets === 1 ? "" : "s"} booked against ${people} scheduled ${people === 1 ? "person" : "people"}.`,
      });
    }
  }

  // ── Left off the rota entirely ────────────────────────────
  const idle = hours.filter((row) => row.level === "none");
  if (idle.length > 0 && idle.length < staff.length) {
    advice.push({
      id: "unscheduled",
      tone: "info",
      title: `${idle.length} ${idle.length === 1 ? "person has" : "people have"} no shifts this week`,
      evidence: idle.map((row) => row.staffName).join(", ") + ".",
    });
  }

  return advice;
}
