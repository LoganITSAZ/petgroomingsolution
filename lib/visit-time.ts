import { MIN_VISITS_FOR_PATTERN, median } from "@/lib/rhythm";
import { shopDayKey } from "@/lib/utils";

/**
 * Where a visit's time went, read off the status history the shop already
 * writes. Nothing is stored: each history row opens a segment that ends at the
 * next row, and the stage it was opened in decides which figure it adds to.
 *
 * Check-in to finish is not blade time — an afternoon waiting for an owner
 * reads as a four-hour groom — so the figures are kept apart. Drying is its
 * own figure: some dogs are dried by hand and some sit in a cage dryer, and
 * the history cannot tell which.
 *
 * Pure. The queried half is `lib/visit-time-queries.ts`.
 */

export type TimeBucket = "waiting" | "bath" | "drying" | "table" | "household" | "collect";

export const TIME_BUCKETS: readonly TimeBucket[] = ["waiting", "bath", "drying", "table", "household", "collect"];

export const BUCKET_LABEL: Record<TimeBucket, string> = {
  waiting: "Waiting",
  bath: "Bath",
  drying: "Drying",
  table: "Table",
  household: "Waiting for the household",
  collect: "Owner to collect",
};

/** Scheduled, cancelled, no-show and picked up open nothing. */
const BUCKET_OF: Partial<Record<string, TimeBucket>> = {
  CHECKED_IN: "waiting",
  IN_PROGRESS: "bath",
  DRYING: "drying",
  FINISHING: "table",
  COMPLETE: "household",
  READY_PICKUP: "collect",
};

/** Stages somebody is working in. Waiting can legitimately run all afternoon. */
const WORK_BUCKETS: readonly TimeBucket[] = ["bath", "drying", "table"];

/** Under this, a stage was clicked through rather than worked in. */
const MIN_SEGMENT_MINS = 1;

/** Over this, a groom stage is a forgotten tap, not a groom. */
const MAX_WORK_SEGMENT_MINS = 180;

export interface HistoryRow {
  status: string;
  changedAt: Date;
}

export interface VisitTime {
  /** Absent: never entered. Null: entered, but not a measurement. */
  mins: Partial<Record<TimeBucket, number | null>>;
  /** The stage the visit is in now, still running to `now`. */
  openBucket: TimeBucket | null;
  /** A groom stage crossed a day or ran past the cap, so the hands-on total cannot be trusted. */
  suspect: boolean;
}

export function visitTime(history: HistoryRow[], now: Date): VisitTime {
  const rows = [...history].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  const raw: Partial<Record<TimeBucket, number | null>> = {};
  let openBucket: TimeBucket | null = null;
  let suspect = false;

  rows.forEach((current, index) => {
    const bucket = BUCKET_OF[current.status];
    if (!bucket) return;
    const next = rows[index + 1];
    const end = next?.changedAt ?? now;
    if (!next) openBucket = bucket;

    const length = (end.getTime() - current.changedAt.getTime()) / 60_000;
    const crossesDay = shopDayKey(current.changedAt) !== shopDayKey(end);
    const overCap = WORK_BUCKETS.includes(bucket) && length > MAX_WORK_SEGMENT_MINS;
    if (WORK_BUCKETS.includes(bucket) && (crossesDay || overCap)) suspect = true;

    // One bad segment spoils the stage: half a figure reads as a fast groom.
    if (raw[bucket] === null) return;
    raw[bucket] = length < MIN_SEGMENT_MINS || crossesDay || overCap ? null : (raw[bucket] ?? 0) + length;
  });

  const mins: Partial<Record<TimeBucket, number | null>> = {};
  for (const bucket of TIME_BUCKETS) {
    if (bucket in raw) mins[bucket] = raw[bucket] == null ? null : Math.round(raw[bucket] as number);
  }
  return { mins, openBucket, suspect };
}

/**
 * Bath, drying and table together: the time the dog actually took, against
 * which a booked slot is measured.
 *
 * A clicked-through stage took no time, so it adds nothing rather than
 * spoiling the sum. A stage cut for crossing a day or running past the cap
 * does spoil it — its real length is unknown.
 */
export function workedMins(time: VisitTime): number | null {
  if (time.suspect) return null;
  const { bath, table, drying } = time.mins;
  if (typeof bath !== "number" && typeof table !== "number") return null;
  return (bath ?? 0) + (drying ?? 0) + (table ?? 0);
}

export interface BucketSummary {
  bucket: TimeBucket;
  label: string;
  /** Null below `MIN_VISITS_FOR_PATTERN` measured visits. */
  medianMins: number | null;
  visits: number;
  evidence: string;
}

/** The shop's typical visit, stage by stage. Pass finished visits only. */
export function summariseVisitTimes(times: VisitTime[]): BucketSummary[] {
  return TIME_BUCKETS.map((bucket) => {
    // A stage still running is a figure so far, not a figure.
    const values = times
      .filter((time) => time.openBucket !== bucket)
      .map((time) => time.mins[bucket])
      .filter((mins): mins is number => typeof mins === "number");
    const enough = values.length >= MIN_VISITS_FOR_PATTERN;
    return {
      bucket,
      label: BUCKET_LABEL[bucket],
      medianMins: enough ? median(values) : null,
      visits: values.length,
      evidence: enough ? `Median of ${values.length} visits` : `${values.length} measured, ${MIN_VISITS_FOR_PATTERN} needed`,
    };
  });
}

/** One line for the visit screen, or null when the visit has not started. */
export function describeVisitTime(time: VisitTime): string | null {
  const parts = TIME_BUCKETS.filter((bucket) => bucket in time.mins).map((bucket) => {
    const mins = time.mins[bucket];
    const figure = mins == null ? "—" : `${mins} min`;
    return `${BUCKET_LABEL[bucket]} ${figure}${time.openBucket === bucket && mins != null ? " so far" : ""}`;
  });
  return parts.length ? parts.join(" · ") : null;
}

/** In the building and not yet finished: a dog the household is still waiting on. */
export const UNFINISHED_STATUSES: readonly string[] = ["CHECKED_IN", "IN_PROGRESS", "DRYING", "FINISHING"];

/**
 * Which of one household's visits on one day to move to ready-for-pickup:
 * every finished one, once none is still being worked on. A sibling not yet
 * arrived, cancelled or a no-show holds nobody back.
 */
export function householdReadyToTell(visits: { id: string; status: string }[]): string[] {
  if (visits.some((visit) => UNFINISHED_STATUSES.includes(visit.status))) return [];
  return visits.filter((visit) => visit.status === "COMPLETE").map((visit) => visit.id);
}

/** The household's dogs still being worked on, by name. */
export function waitingOn(visits: { status: string; petName: string }[]): string[] {
  return visits.filter((visit) => UNFINISHED_STATUSES.includes(visit.status)).map((visit) => visit.petName);
}

/** "Max", "Max and Bella", "Max, Bella and Rex", with the verb to match. */
export function joinPetNames(names: string[]): { names: string; verb: "is" | "are" } {
  if (names.length <= 1) return { names: names[0] ?? "", verb: "is" };
  return { names: `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`, verb: "are" };
}
