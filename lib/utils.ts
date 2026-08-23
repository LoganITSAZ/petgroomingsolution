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
