import { prisma } from "@/lib/prisma";
import { FINISHED_STATUSES } from "@/lib/analytics";
import { guidesForBreeds } from "@/lib/breeds";
import { visitTime, workedMins } from "@/lib/visit-time";

/**
 * How long this pet actually takes, rather than how long the catalog says.
 *
 * The shop already knew this — `petInsights()` has been saying "usually runs
 * 20 min over" on the pet's profile for as long as there have been insights.
 * Nothing acted on it: every booking still got the flat sum of its services'
 * durations, so the same pet pushed the same day out of shape every visit and
 * a person had to notice and type a bigger number.
 *
 * This is that observation fed back into the booking. It is a suggestion the
 * shop can overwrite — `durationMins` stays editable on the appointment, and
 * an explicit duration from a caller always wins.
 *
 * A first visit has nothing of its own to learn from, so the breed guide's own
 * `typicalMins` — which the shop already typed and already reads at the
 * station — stands in until the pet has a history. The pet always beats the
 * breed: a Poodle with three measured visits is groomed on its own numbers.
 */

/** Below this many measured visits, an overrun is one bad afternoon. */
export const MIN_VISITS_FOR_DURATION = 3;

/**
 * Drift smaller than this is not worth moving the slot for — it is inside the
 * noise of when somebody remembered to press the button.
 */
export const MIN_DRIFT_MINS = 10;

/** Slots move in fives on every other screen; they move in fives here too. */
const STEP_MINS = 5;

export interface MeasuredVisit {
  /** When the pet was checked in. */
  checkedInAt: Date | null;
  /** When the groom finished. */
  finishedAt: Date;
  /** What the slot was booked for. */
  durationMins: number | null;
  /** Bath, drying and table from the status history; null when not measured. */
  workedMins?: number | null;
}

/**
 * Minutes each visit ran over (positive) or under (negative) its booked slot.
 *
 * Pure. Visits with nothing to measure against — no check-in, no booked
 * duration — contribute nothing rather than counting as zero drift, which
 * would drag every real overrun back towards the catalog.
 */
export function overrunsFrom(visits: MeasuredVisit[]): number[] {
  return visits
    .filter((visit) => visit.durationMins != null && (visit.workedMins != null || visit.checkedInAt != null))
    .map((visit) => {
      // Hands-on time when the history measured it; otherwise turnaround,
      // which counts the wait for the owner as groom and is why the clamp exists.
      const actual =
        visit.workedMins ??
        Math.round((visit.finishedAt.getTime() - (visit.checkedInAt as Date).getTime()) / 60_000);
      return actual - (visit.durationMins as number);
    })
    .filter((drift) => Number.isFinite(drift));
}

/**
 * The pet's habitual drift, or null when there is not enough of it to act on.
 *
 * Median, not mean: one groom that stopped for a vet call must not rewrite
 * every future slot, and the whole point of a habit is the middle of it.
 */
export function typicalOverrunMins(overruns: number[]): number | null {
  if (overruns.length < MIN_VISITS_FOR_DURATION) return null;
  const sorted = [...overruns].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const typical =
    sorted.length % 2 === 0
      ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
      : sorted[middle];
  return Math.abs(typical) >= MIN_DRIFT_MINS ? typical : null;
}

/**
 * The booked duration this pet's own history argues for.
 *
 * Clamped to half and double the catalog figure. Hands-on time is measured
 * from the status history where it can be, but a visit from before that, or
 * one whose stages were not tapped, still falls back to check-in to finish —
 * and one afternoon waiting for an owner must not book the next groom for
 * four hours.
 */
export function learnedDuration(baseMins: number, overrunMins: number | null): number {
  if (overrunMins == null) return baseMins;
  const adjusted = Math.round((baseMins + overrunMins) / STEP_MINS) * STEP_MINS;
  const floor = Math.max(STEP_MINS, Math.round(baseMins / 2 / STEP_MINS) * STEP_MINS);
  return Math.min(Math.max(adjusted, floor), baseMins * 2);
}

/** How the adjustment reads in an audit row, or null when nothing was adjusted. */
export function durationReason(
  baseMins: number,
  learnedMins: number,
  visitCount: number
): string | null {
  if (learnedMins === baseMins) return null;
  const drift = learnedMins - baseMins;
  const direction = drift > 0 ? "longer" : "shorter";
  return `Booked ${Math.abs(drift)} min ${direction} than the ${baseMins} min catalog slot: this pet's last ${visitCount} visits ran that way.`;
}

/**
 * The breed figure is a *full groom*, so it may only move a booking long
 * enough to be one. Without this a 15 minute nail trim on a Poodle would book
 * for half an hour because the breed takes two.
 */
const MIN_BREED_BASE_RATIO = 0.5;

/**
 * The slot a breed guide argues for.
 *
 * Pure. Returns the catalog figure when there is no guide, when the guide has
 * no time on it, when the booking is too short to be the groom the guide
 * describes, or when the difference is inside the noise. The ratio guard is
 * also the ceiling — a figure more than double the slot fails it outright —
 * so only the floor is applied here.
 */
export function breedDuration(baseMins: number, typicalMins: number | null | undefined): number {
  if (typicalMins == null || typicalMins <= 0) return baseMins;
  if (baseMins < typicalMins * MIN_BREED_BASE_RATIO) return baseMins;
  if (Math.abs(typicalMins - baseMins) < MIN_DRIFT_MINS) return baseMins;
  const adjusted = Math.round(typicalMins / STEP_MINS) * STEP_MINS;
  const floor = Math.max(STEP_MINS, Math.round(baseMins / 2 / STEP_MINS) * STEP_MINS);
  return Math.max(adjusted, floor);
}

/** How a breed adjustment reads in an audit row, or null when nothing moved. */
export function breedReason(baseMins: number, breedMins: number, breed: string): string | null {
  if (breedMins === baseMins) return null;
  const drift = breedMins - baseMins;
  return `Booked ${Math.abs(drift)} min ${drift > 0 ? "longer" : "shorter"} than the ${baseMins} min catalog slot: no measured visits for this pet yet, and the shop's ${breed} guide says this long.`;
}

/** The last measured visits for a pet. Ten is a season of grooms, not a career. */
export async function petOverruns(petId: string, take = 10): Promise<number[]> {
  const visits = await prisma.appointment.findMany({
    where: { petId, status: { in: FINISHED_STATUSES }, checkedInAt: { not: null } },
    select: {
      checkedInAt: true,
      completedAt: true,
      durationMins: true,
      updatedAt: true,
      statusHistory: { select: { status: true, changedAt: true } },
    },
    orderBy: { scheduledAt: "desc" },
    take,
  });

  const now = new Date();
  return overrunsFrom(
    visits.map((visit) => ({
      checkedInAt: visit.checkedInAt,
      // completedAt is the fact; updatedAt is the last touch, which is the
      // best available stand-in for a visit closed out before that column
      // existed.
      finishedAt: visit.completedAt ?? visit.updatedAt,
      durationMins: visit.durationMins,
      workedMins: workedMins(visitTime(visit.statusHistory, now)),
    }))
  );
}

export interface LearnedSlot {
  mins: number;
  /** Null when the catalog figure stood. */
  reason: string | null;
}

/** The slot to book for this pet, with the sentence explaining any change. */
export async function learnedSlotForPet(petId: string, baseMins: number): Promise<LearnedSlot> {
  const overruns = await petOverruns(petId);
  const typical = typicalOverrunMins(overruns);
  if (typical != null) {
    const mins = learnedDuration(baseMins, typical);
    return { mins, reason: durationReason(baseMins, mins, overruns.length) };
  }

  // Nothing measured on this pet: fall back to the breed the shop wrote down.
  const pet = await prisma.pet.findUnique({ where: { id: petId }, select: { breed: true } });
  if (!pet?.breed) return { mins: baseMins, reason: null };
  const guide = (await guidesForBreeds([pet.breed])).get(pet.breed.trim().toLowerCase());
  const mins = breedDuration(baseMins, guide?.typicalMins);
  return { mins, reason: breedReason(baseMins, mins, guide?.breed ?? pet.breed) };
}
