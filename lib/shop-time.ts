import { SHOP_TIMEZONE, zoneOffsetMs } from "@/lib/utils";

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
