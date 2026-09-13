import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatServiceType(service: string): string {
  return service
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export function formatStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export function formatSpecies(species: string): string {
  const map: Record<string, string> = { DOG: "Dog", CAT: "Cat", OTHER: "Other" };
  return map[species] ?? species;
}

export function formatCoatType(coat: string): string {
  const map: Record<string, string> = {
    SHORT: "Short", MEDIUM: "Medium", LONG: "Long",
    DOUBLE: "Double", CURLY: "Curly", WIRE: "Wire", HAIRLESS: "Hairless",
  };
  return map[coat] ?? coat;
}

/**
 * IANA timezone the shop operates in. Every business-hours / walk-in-window
 * comparison must resolve through this so that the server (which may run in
 * UTC) and the browser (which runs in the viewer's zone) agree.
 */
export const SHOP_TIMEZONE = "America/Phoenix";

/** Current wall-clock time in the shop's timezone, as "HH:MM" (24-hour). */
export function currentShopTime(
  now: Date = new Date(),
  timeZone: string = SHOP_TIMEZONE
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23", // h23, not hour12:false — the latter can yield "24:00" at midnight
  }).format(now);
}

/** Minutes since midnight for an "HH:MM" string; NaN if unparseable. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

/**
 * True if the given moment falls in [start, end) — end exclusive — evaluated
 * in the shop's timezone. `start` and `end` are "HH:MM" strings from
 * SystemConfig.walkInWindowStart / walkInWindowEnd.
 */
export function isWithinWalkInWindow(
  start: string,
  end: string,
  now: Date = new Date()
): boolean {
  const nowMins = toMinutes(currentShopTime(now));
  const startMins = toMinutes(start);
  const endMins = toMinutes(end);
  if (Number.isNaN(nowMins) || Number.isNaN(startMins) || Number.isNaN(endMins)) {
    return false;
  }
  return nowMins >= startMins && nowMins < endMins;
}

/** Milliseconds `timeZone` is ahead of UTC at the given instant. */
export function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asIfUtc - at.getTime();
}

/** The instant that is midnight in `timeZone` on the given calendar date. */
function zonedMidnight(utcCalendarMs: number, timeZone: string): Date {
  // Two passes so a DST transition on the target date still resolves correctly.
  const first = utcCalendarMs - zoneOffsetMs(new Date(utcCalendarMs), timeZone);
  return new Date(utcCalendarMs - zoneOffsetMs(new Date(first), timeZone));
}

/**
 * Half-open [start, end) covering "today" in the shop's timezone.
 *
 * The server may run in UTC, so `new Date().setHours(0,0,0,0)` picks the wrong
 * day boundary for the shop — use this for any "today" database range.
 */
export function shopDayRange(
  now: Date = new Date(),
  timeZone: string = SHOP_TIMEZONE
): { start: Date; end: Date } {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);

  return {
    start: zonedMidnight(Date.UTC(year, month - 1, day), timeZone),
    end: zonedMidnight(Date.UTC(year, month - 1, day + 1), timeZone),
  };
}

/**
 * Half-open [start, end) covering one shop-local calendar day, named by its
 * key ("2026-08-24"). Returns null when the key is not a real date.
 *
 * A `?date=` parameter names a day the way the shop says it, so it must not be
 * read as a UTC day: in Phoenix that window opens at 5pm the previous
 * afternoon and drops the whole evening off the end.
 */
export function shopDayRangeForKey(
  key: string,
  timeZone: string = SHOP_TIMEZONE
): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;

  const [year, month, day] = match.slice(1).map(Number);
  const utcCalendar = Date.UTC(year, month - 1, day);
  // Date.UTC rolls an impossible date forward (Feb 31 becomes Mar 3), so the
  // month has to be checked back rather than trusted.
  const rolled = new Date(utcCalendar);
  if (rolled.getUTCMonth() !== month - 1 || rolled.getUTCDate() !== day) return null;

  return {
    start: zonedMidnight(utcCalendar, timeZone),
    end: zonedMidnight(Date.UTC(year, month - 1, day + 1), timeZone),
  };
}

/** Format a date in the shop's timezone (server renders in UTC otherwise). */
export function formatShopDate(
  date: Date,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }
): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: SHOP_TIMEZONE }).format(date);
}

/** Format a clock time in the shop's timezone, e.g. "9:30 AM". */
export function formatShopTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Shop-local calendar day key, e.g. "2026-08-23". */
export function shopDayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Display name for a staff role. */
export function formatRole(role: string): string {
  const map: Record<string, string> = {
    ADMIN: "Admin",
    MANAGER: "Shop manager",
    GROOMER: "Groomer",
    BATHER: "Bather",
    CUSTOMER: "Customer",
  };
  return map[role] ?? role;
}

/**
 * A station's role names the work done at it, not the person doing it —
 * "Grooming", the way `Bathing` and `Kennels` already read. `Groomer` was the
 * odd one out, and it collided with the StaffRole of the same name that
 * `formatRole()` above renders: on the stations page the section heading and
 * the person standing at it were the same word for two different things.
 *
 * Four screens kept their own copy of this map and disagreed about the third
 * entry ("Kennels" on the floor, "Kennel Unit" in the admin panel), which is
 * exactly what the "enum to display string lives in lib/utils" rule exists to
 * prevent. Everything renders this now.
 */
export function formatStationRole(role: string): string {
  const map: Record<string, string> = {
    GROOMER: "Grooming",
    BATHING: "Bathing",
    DRYING: "Drying",
    KENNEL: "Kennels",
  };
  return map[role] ?? role;
}

/** Tailwind classes for a station-role badge. */
export function stationRoleBadgeClass(role: string): string {
  const map: Record<string, string> = {
    GROOMER: "bg-amber-100 text-amber-700",
    BATHING: "bg-sky-100 text-sky-700",
    DRYING: "bg-violet-100 text-violet-700",
    KENNEL: "bg-emerald-100 text-emerald-700",
  };
  return map[role] ?? "bg-stone-100 text-stone-600";
}

/**
 * Tailwind classes for an appointment status badge.
 *
 * One map for the whole app: six screens each kept their own copy and two of
 * them had already drifted, listing only the in-shop statuses.
 */
export function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    SCHEDULED: "bg-stone-100 text-stone-600",
    CHECKED_IN: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-amber-100 text-amber-700",
    DRYING: "bg-sky-100 text-sky-700",
    FINISHING: "bg-purple-100 text-purple-700",
    COMPLETE: "bg-green-100 text-green-700",
    READY_PICKUP: "bg-emerald-100 text-emerald-800",
    PICKED_UP: "bg-stone-100 text-stone-400",
    CANCELLED: "bg-red-100 text-red-700",
    NO_SHOW: "bg-red-100 text-red-400",
  };
  return map[status] ?? "bg-stone-100 text-stone-500";
}

/** Tailwind classes for a role badge. */
export function roleBadgeClass(role: string): string {
  const map: Record<string, string> = {
    ADMIN: "bg-amber-100 text-amber-800",
    MANAGER: "bg-violet-100 text-violet-800",
    GROOMER: "bg-stone-100 text-stone-700",
    BATHER: "bg-sky-100 text-sky-700",
  };
  return map[role] ?? "bg-stone-100 text-stone-500";
}

/**
 * Roles that mean a person works pets on the floor.
 *
 * ADMIN and MANAGER are deliberately absent: they grant access to the admin
 * panel, nothing more. An account holding only those is a service account and
 * is never offered for, or accepted as, an assignment.
 */
export const FLOOR_ROLES = ["GROOMER", "BATHER"] as const;

export function isFloorStaff(roles: readonly string[]): boolean {
  return roles.some((role) => (FLOOR_ROLES as readonly string[]).includes(role));
}

/** Shop-local clock in 24-hour form, for <input type="time"> values. */
export function formatShopTime24(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SHOP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
