/**
 * Whether a chain of escalating thresholds (watch → late → missed/critical)
 * is actually in ascending order.
 *
 * The server already reorders defensively on save (lib/arrivals.ts,
 * lib/pickups.ts, the settings action) so a mis-typed value can never invert
 * the scale — this is only for telling the admin *before* they save that
 * their numbers are about to be nudged.
 */
export function isAscending(values: number[]): boolean {
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}

/**
 * Whether an end date/time string is after its start, for a datetime-local
 * pair. Either side may be blank (an open-ended window), which is never a
 * conflict — only two actual values in the wrong order are.
 */
export function isEndAfterStart(start: string, end: string): boolean {
  if (!start || !end) return true;
  return end > start;
}
