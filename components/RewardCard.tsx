import type { RewardCard as Card } from "@/lib/rewards";

/**
 * The punch card, drawn as punches.
 *
 * A row of filled and empty marks is how a paper card reads, and it answers
 * "how close am I?" without arithmetic. The count is written out beside it,
 * because the marks alone are not readable to a screen reader and a long card
 * is hard to count by eye.
 */

/** Long cards would wrap into a wall of dots; past this, show the count only. */
const MAX_DOTS = 12;

export default function RewardCard({
  card,
  size = "normal",
}: {
  card: Card;
  /** "compact" for a row in a list, "normal" for a page of its own. */
  size?: "compact" | "normal";
}) {
  if (!card.enabled) return null;

  const ready = card.available > 0;
  const dot = size === "compact" ? "h-2 w-2" : "h-3 w-3";

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {card.perReward <= MAX_DOTS && (
        <span
          className="flex items-center gap-1"
          role="img"
          aria-label={`${card.progress} of ${card.perReward} visits`}
        >
          {Array.from({ length: card.perReward }, (_, index) => (
            <span
              key={index}
              className={`${dot} rounded-full ${
                index < card.progress
                  ? ready
                    ? "bg-emerald-600"
                    : "bg-amber-700"
                  : "bg-stone-200 border border-stone-300"
              }`}
            />
          ))}
        </span>
      )}

      <span className={size === "compact" ? "text-xs" : "text-sm"}>
        {ready ? (
          <span className="font-bold text-emerald-800">
            {card.available > 1 ? `${card.available} rewards ready` : "Reward ready"} — {card.label}
          </span>
        ) : (
          <span className="text-stone-600">
            {card.progress} of {card.perReward} visits ·{" "}
            <span className="text-stone-500">
              {card.toNext} more for {card.label.toLowerCase()}
            </span>
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * The one-word version, for a dense row where the dots will not fit. Takes an
 * optional card so a list can hand it a lookup miss without a cast.
 */
export function RewardBadge({ card }: { card?: Card }) {
  if (!card?.enabled || card.available < 1) return null;
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">
      ★ REWARD{card.available > 1 ? ` ×${card.available}` : ""}
    </span>
  );
}
