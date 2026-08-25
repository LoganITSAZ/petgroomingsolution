import { SHOP_TIMEZONE } from "@/lib/utils";

/**
 * Converting the shop's wall clock into instants.
 *
 * Kept out of the server-action module because a "use server" file may only
 * export async functions.
 */

/** Milliseconds the shop's zone is ahead of UTC at a given moment. */
function zoneOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return (
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) -
    at.getTime()
  );
}

/** "2026-08-24" + "08:00" in shop time → the matching instant. */
export function shopMoment(dayKey: string, time: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes so a DST change on that date still resolves correctly.
  const first = naive - zoneOffsetMs(new Date(naive));
  return new Date(naive - zoneOffsetMs(new Date(first)));
}
