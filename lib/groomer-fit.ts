import { STATUS_FLOW } from "@/lib/appointment-flow";
import type { PetSize } from "@/lib/pet-size";
import { MIN_VISITS_FOR_PATTERN, median } from "@/lib/rhythm";

/**
 * Which groomer suits which pet, judged on the rows the shop already writes.
 *
 * Errors gate and speed ranks: a groomer whose error rate on this kind of dog
 * is clearly above the shop's is never the pick, however fast, and among the
 * rest the faster one wins only by a clear margin. There is no exchange rate
 * between minutes and mistakes. The owner's preferred groomer is a preference,
 * not a guarantee.
 *
 * Pure. The queried half is `lib/groomer-fit-queries.ts`.
 */

export const FIT_WINDOW_DAYS = 365;
export const MIN_FIT_VISITS = MIN_VISITS_FOR_PATTERN;
export const MIN_ERROR_VISITS = 2;
export const ERROR_RATE_RATIO = 2;
export const ERROR_RATE_POINTS = 0.1;
export const SPEED_RATIO = 0.15;
export const SPEED_MINS = 10;
export const USUAL_GROOMER_VISITS = 5;
export const MAX_FIT_INSIGHTS = 3;

export type ErrorCause = "COMPLAINT" | "REDO" | "INJURY" | "BITE" | "BEHAVIORAL" | "REDO_VISIT" | "SENT_BACK";

/** Logged events that count. A rewash, matting or a broken dryer is not the groomer's doing. */
const ERROR_EVENTS: readonly string[] = ["COMPLAINT", "REDO", "INJURY", "BITE", "BEHAVIORAL"];

export const CAUSE_LABEL: Record<ErrorCause, string> = {
  COMPLAINT: "complaint",
  REDO: "redo at the counter",
  INJURY: "injury",
  BITE: "bite",
  BEHAVIORAL: "behaviour",
  REDO_VISIT: "redo booked",
  SENT_BACK: "sent back a stage",
};

interface HistoryRow {
  status: string;
  changedAt: Date;
}

/** Did the pet move backward along the flow at any point? */
function sentBack(history: HistoryRow[]): boolean {
  const flow = STATUS_FLOW as readonly string[];
  let furthest = -1;
  for (const row of [...history].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime())) {
    const index = flow.indexOf(row.status);
    if (index < 0) continue;
    if (index < furthest) return true;
    furthest = index;
  }
  return false;
}

/** Why a visit counts as an error visit; empty when it does not. */
export function errorCauses(visit: { eventTypes: string[]; history: HistoryRow[]; redoVisits: number }): ErrorCause[] {
  const causes = new Set<ErrorCause>();
  for (const type of visit.eventTypes) if (ERROR_EVENTS.includes(type)) causes.add(type as ErrorCause);
  if (visit.redoVisits > 0) causes.add("REDO_VISIT");
  // A logged rewash explains the trip back to the bath.
  if (!visit.eventTypes.includes("REWASH") && sentBack(visit.history)) causes.add("SENT_BACK");
  return Array.from(causes);
}

/** A redo's hands-on time belongs to the visit it fixes. */
export function foldRedoMins(own: number | null, redos: (number | null)[]): number | null {
  if (own == null) return null;
  return redos.reduce<number>((sum, mins) => sum + (mins ?? 0), own);
}

export interface FitSample {
  appointmentId: string;
  staffId: string;
  petId: string;
  guideId: string | null;
  guideName: string | null;
  serviceType: string;
  sizeTier: PetSize | null;
  coatType: string | null;
  finishedAt: Date;
  /** Hands-on minutes, redos included; null when unmeasured. */
  workedMins: number | null;
  errors: ErrorCause[];
}

export interface FitStats {
  visits: number;
  errorVisits: number;
  rate: number;
  measured: number;
  medianMins: number | null;
}

export function fitStats(samples: FitSample[]): FitStats {
  const mins = samples.flatMap((s) => (s.workedMins == null ? [] : [s.workedMins]));
  const errorVisits = samples.filter((s) => s.errors.length > 0).length;
  return {
    visits: samples.length,
    errorVisits,
    rate: samples.length > 0 ? errorVisits / samples.length : 0,
    measured: mins.length,
    medianMins: median(mins),
  };
}

export const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/** Clearly worse than the shop: two or more errors, twice the rate and ten points above it. */
export function errorGate(groomer: FitStats, shop: FitStats | null): boolean {
  if (!shop || groomer.visits < MIN_FIT_VISITS || groomer.errorVisits < MIN_ERROR_VISITS) return false;
  return (
    groomer.rate >= shop.rate * ERROR_RATE_RATIO &&
    // Float noise: 0.25 - 0.15 is 0.09999…
    groomer.rate - shop.rate >= ERROR_RATE_POINTS - 1e-9
  );
}

/** Faster by both margins, so neither a trivial nor a noisy gap decides anything. */
export function beats(fastMins: number, slowMins: number): boolean {
  const gap = slowMins - fastMins;
  return gap >= SPEED_MINS && gap / slowMins >= SPEED_RATIO;
}

export interface SpeedWin {
  staffId: string;
  mins: number;
  visits: number;
  otherMins: number;
  otherVisits: number;
}

export function speedWinner(entries: { staffId: string; stats: FitStats }[]): SpeedWin | null {
  const timed = entries
    .filter((e) => e.stats.measured >= MIN_FIT_VISITS && e.stats.medianMins != null)
    .sort((a, b) => (a.stats.medianMins as number) - (b.stats.medianMins as number));
  if (timed.length < 2) return null;
  const [best, next] = timed;
  const mins = best.stats.medianMins as number;
  const otherMins = next.stats.medianMins as number;
  if (!beats(mins, otherMins)) return null;
  return { staffId: best.staffId, mins, visits: best.stats.measured, otherMins, otherVisits: next.stats.measured };
}

/** Whoever did most of the pet's last five visits; a tie goes to the most recent. */
export function usualGroomer(petSamples: FitSample[]): { staffId: string; count: number; of: number } | null {
  const recent = [...petSamples]
    .sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime())
    .slice(0, USUAL_GROOMER_VISITS);
  if (recent.length === 0) return null;
  const counts = new Map<string, number>();
  for (const s of recent) counts.set(s.staffId, (counts.get(s.staffId) ?? 0) + 1);
  // Map keeps insertion order, and `recent` is newest first: the first to the
  // top count is the most recent of the tied.
  let best: string = recent[0].staffId;
  counts.forEach((count, staffId) => {
    if (count > (counts.get(best) as number)) best = staffId;
  });
  return { staffId: best, count: counts.get(best) as number, of: recent.length };
}

export interface FitQuestion {
  petId: string;
  guideId: string | null;
  serviceType: string;
  preferredStaffId: string | null;
  /** Who could take it: active groomers at booking, the ready people on the floor. */
  candidates: { id: string; name: string }[];
}

export interface GroomerPick {
  staffId: string;
  staffName: string;
  reason: string;
}

/** Fit, then the owner's preference, then the usual groomer, then nobody. */
export function bookingGroomer(question: FitQuestion, samples: FitSample[]): GroomerPick | null {
  const names = new Map(question.candidates.map((c) => [c.id, c.name]));
  const breed = question.guideId
    ? samples.filter((s) => s.guideId === question.guideId && s.serviceType === question.serviceType)
    : [];
  // One pet's history is too thin to be a baseline: the shop's rate is always the breed's.
  const shop = breed.length > 0 ? fitStats(breed) : null;
  const onPet = samples.filter((s) => s.petId === question.petId);
  const petLevel =
    question.candidates.filter((c) => onPet.filter((s) => s.staffId === c.id).length >= MIN_FIT_VISITS).length >= 2;
  const level = petLevel ? onPet : breed;
  const statsOf = (staffId: string) => fitStats(level.filter((s) => s.staffId === staffId));
  const gated = new Set(question.candidates.filter((c) => errorGate(statsOf(c.id), shop)).map((c) => c.id));

  const preferred =
    question.preferredStaffId && names.has(question.preferredStaffId) ? question.preferredStaffId : null;
  const usual = usualGroomer(onPet);
  const usualId = usual && names.has(usual.staffId) ? usual.staffId : null;

  const skipped = Array.from(new Set([preferred, usualId]))
    .filter((id): id is string => id != null && gated.has(id))
    .map((id) => {
      const stats = statsOf(id);
      return `${names.get(id)} skipped: ${stats.errorVisits} of ${stats.visits} visits had an error, shop ${pct(shop?.rate ?? 0)}`;
    });
  const pick = (staffId: string, why: string): GroomerPick => ({
    staffId,
    staffName: names.get(staffId) as string,
    reason: [...skipped, why].join("; "),
  });

  const win = speedWinner(
    question.candidates.filter((c) => !gated.has(c.id)).map((c) => ({ staffId: c.id, stats: statsOf(c.id) }))
  );
  if (win) {
    return pick(
      win.staffId,
      `faster on this ${petLevel ? "pet" : "breed"}: ${win.mins} vs ${win.otherMins} min over ${win.visits} and ${win.otherVisits} visits`
    );
  }
  if (preferred && !gated.has(preferred)) return pick(preferred, "owner's preference");
  if (usual && usualId && !gated.has(usualId)) return pick(usualId, `groomed ${usual.count} of last ${usual.of}`);
  return null;
}
