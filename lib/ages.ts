import { shopDayKey } from "@/lib/utils";

/** "11 yr", or "5 mo" for a puppy: read at the counter, where a birthday is not the question. */
export function petAge(born: Date, now: Date): string {
  // A birth date is stored as UTC midnight of the day typed; today is the shop's day, not the server's.
  const [by, bm, bd] = born.toISOString().slice(0, 10).split("-").map(Number);
  const [ny, nm, nd] = shopDayKey(now).split("-").map(Number);
  const months = (ny - by) * 12 + nm - bm - (nd < bd ? 1 : 0);
  return months >= 12 ? `${Math.floor(months / 12)} yr` : `${Math.max(months, 0)} mo`;
}

/** "today", "3 days ago", "6 weeks ago", "4 months ago": how long since a groom, in the words the counter uses. */
export function timeSince(at: Date, now: Date): string {
  const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"} ago`;
  if (days < 70) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
