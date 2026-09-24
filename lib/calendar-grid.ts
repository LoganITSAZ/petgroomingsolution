/**
 * The shape of a calendar, with no appointments in it.
 *
 * Day keys are `YYYY-MM-DD` in shop time — the same strings `shopDayKey()`
 * hands out and `shopDayRangeForKey()` turns back into instants — so the grid
 * is built by whole-day arithmetic and never by adding 86400000 to a date,
 * which is a day out whenever a zone shifts under it.
 *
 * Pure, so the awkward part (a month that starts on a Saturday, a 31st in the
 * trailing row) is tested rather than eyeballed on a screen.
 */

/** Shift a day key by whole days. Noon keeps a DST boundary out of it. */
export function shiftDayKey(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0 = Sunday, the column a day sits in. */
export function weekdayIndex(dayKey: string): number {
  return new Date(`${dayKey}T12:00:00Z`).getUTCDay();
}

/** The first and last day of the week or calendar month holding `anchorKey`. */
export function unitBounds(
  anchorKey: string,
  unit: "week" | "month"
): { first: string; last: string } {
  if (unit === "week") {
    const first = shiftDayKey(anchorKey, -weekdayIndex(anchorKey));
    return { first, last: shiftDayKey(first, 6) };
  }
  const first = `${anchorKey.slice(0, 7)}-01`;
  const next = new Date(`${first}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { first, last: shiftDayKey(next.toISOString().slice(0, 10), -1) };
}

/**
 * Sunday-start rows of seven day keys covering the whole unit.
 *
 * A month is padded out to full weeks, so the first row can begin in the
 * previous month and the last can end in the next — `unitBounds()` is what
 * tells a cell whether it belongs to the month being read.
 */
export function calendarWeeks(anchorKey: string, unit: "week" | "month"): string[][] {
  const { first, last } = unitBounds(anchorKey, unit);
  const start = shiftDayKey(first, -weekdayIndex(first));
  const end = shiftDayKey(last, 6 - weekdayIndex(last));

  const weeks: string[][] = [];
  for (let day = start; day <= end; day = shiftDayKey(day, 1)) {
    if (weeks.length === 0 || weeks[weeks.length - 1].length === 7) weeks.push([]);
    weeks[weeks.length - 1].push(day);
  }
  return weeks;
}
