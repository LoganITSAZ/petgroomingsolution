import { getConfig } from "@/lib/config";

/**
 * How late an arrival is.
 *
 * A few minutes is traffic; half an hour with no word is a different problem.
 * The shop decides where those lines sit, because it depends on the shop.
 */

export type ArrivalLevel = "on_time" | "due" | "late" | "very_late" | "missed";

export interface ArrivalThresholds {
  watchMins: number;
  lateMins: number;
  missedMins: number;
}

export async function arrivalThresholds(): Promise<ArrivalThresholds> {
  const config = await getConfig();
  // Kept in order even if the settings are saved out of order.
  const watchMins = Math.max(0, config.lateArrivalWatchMins);
  const lateMins = Math.max(watchMins + 1, config.lateArrivalLateMins);
  const missedMins = Math.max(lateMins + 1, config.lateArrivalMissedMins);
  return { watchMins, lateMins, missedMins };
}

/** Minutes past the appointment time; negative when it is still to come. */
export function minutesLate(scheduledAt: Date, now: Date = new Date()): number {
  return Math.round((now.getTime() - scheduledAt.getTime()) / 60000);
}

export function arrivalLevel(
  scheduledAt: Date,
  thresholds: ArrivalThresholds,
  now: Date = new Date()
): ArrivalLevel {
  const late = minutesLate(scheduledAt, now);
  if (late < thresholds.watchMins) return "on_time";
  if (late < thresholds.lateMins) return "due";
  if (late < thresholds.missedMins) return "late";
  if (late < thresholds.missedMins * 2) return "very_late";
  return "missed";
}

export const ARRIVAL_LABEL: Record<ArrivalLevel, string> = {
  on_time: "On time",
  due: "Due now",
  late: "Running late",
  very_late: "Very late",
  missed: "Treat as missed",
};

/** Green through to red, matching how worried the shop should be. */
export const ARRIVAL_CLASS: Record<ArrivalLevel, string> = {
  on_time: "bg-green-100 text-green-700",
  due: "bg-lime-100 text-lime-800",
  late: "bg-amber-100 text-amber-800",
  very_late: "bg-orange-100 text-orange-800",
  missed: "bg-red-100 text-red-700",
};

/** Text colour for the time itself, so a glance down the column reads. */
export const ARRIVAL_TEXT_CLASS: Record<ArrivalLevel, string> = {
  on_time: "text-stone-800",
  due: "text-lime-700",
  late: "text-amber-700 font-semibold",
  very_late: "text-orange-700 font-semibold",
  missed: "text-red-700 font-bold",
};
