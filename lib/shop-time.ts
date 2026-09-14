import { SHOP_TIMEZONE, formatShopTime24, shopDayKey, zoneOffsetMs } from "@/lib/utils";

/**
 * Converting the shop's wall clock into instants.
 *
 * Kept out of the server-action module because a "use server" file may only
 * export async functions.
 */

/** "2026-08-24" + "08:00" in shop time → the matching instant. */
export function shopMoment(dayKey: string, time: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes so a DST change on that date still resolves correctly.
  const first = naive - zoneOffsetMs(new Date(naive), SHOP_TIMEZONE);
  return new Date(naive - zoneOffsetMs(new Date(first), SHOP_TIMEZONE));
}

/**
 * An `<input type="datetime-local">` value → the instant it names in shop time.
 *
 * `new Date("2026-09-14T09:00")` reads the string in the *server's* zone, which
 * is UTC in production — a nine o'clock booking lands at two in the morning.
 * Every path that takes a wall clock off a form comes through here instead.
 *
 * Returns null for anything that is not a well-formed local date-time.
 */
export function shopDateTimeLocal(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value.trim());
  if (!match) return null;
  const at = shopMoment(match[1], match[2]);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** The reverse: an instant → the `datetime-local` value showing shop wall clock. */
export function shopDateTimeLocalValue(at: Date): string {
  return `${shopDayKey(at)}T${formatShopTime24(at)}`;
}
