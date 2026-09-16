import { RATING_MAX, ratingLabel } from "@/lib/testimonials";

/**
 * A rating, drawn.
 *
 * The stars are `aria-hidden` and the number is carried in text beside them:
 * five star glyphs read aloud as "black star black star…", which is worse
 * than useless to somebody who cannot see the row.
 */
export default function Stars({
  rating,
  className = "",
}: {
  rating: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <span aria-hidden="true" className="tracking-[0.1em] text-brand-600">
        {"★".repeat(rating)}
        <span className="opacity-25">{"★".repeat(RATING_MAX - rating)}</span>
      </span>
      <span className="sr-only">{ratingLabel(rating)}</span>
    </span>
  );
}
