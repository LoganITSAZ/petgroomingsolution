/**
 * What a testimonial is, without a database in it.
 *
 * A testimonial reaches the public site only once a manager has read it, so
 * the interesting logic here is the three states those two columns make and
 * the arithmetic over ratings. Both are pure, so they are tested directly.
 */

/** Ratings are out of five. Nothing anywhere invents a different scale. */
export const RATING_MAX = 5;

/** The shape the helpers need — a Prisma row satisfies it, so does a literal. */
export interface TestimonialLike {
  rating: number | null;
  approvedAt: Date | null;
  isActive: boolean;
}

export type TestimonialState = "queued" | "published" | "hidden";

/**
 * Where a testimonial stands.
 *
 * Unapproved outranks inactive: a queued entry has not been read yet, so
 * saying it is "hidden" would imply somebody decided that.
 */
export function testimonialState(testimonial: TestimonialLike): TestimonialState {
  if (!testimonial.approvedAt) return "queued";
  return testimonial.isActive ? "published" : "hidden";
}

/**
 * A posted rating, or null.
 *
 * Out of range is null rather than clamped: a 9 typed into a form is a
 * mistake, and recording it as a 5 puts words in somebody's mouth. A rating
 * is optional everywhere, so null is always a legal answer.
 */
export function readRating(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > RATING_MAX) return null;
  return parsed;
}

/**
 * The mean of the ratings that carry one, to one decimal place.
 *
 * Unrated entries are skipped rather than counted as zero — the shop types
 * older testimonials in from cards that never had a number, and counting
 * those as nothing would drag the average down for being old.
 */
export function averageRating(testimonials: TestimonialLike[]): number | null {
  const rated = testimonials.map((t) => t.rating).filter((r): r is number => r !== null);
  if (rated.length === 0) return null;
  return Math.round((rated.reduce((sum, r) => sum + r, 0) / rated.length) * 10) / 10;
}

/** What a screen reader says in place of the stars. */
export function ratingLabel(rating: number): string {
  return `${rating} out of ${RATING_MAX}`;
}
