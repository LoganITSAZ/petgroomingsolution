/**
 * The dashboard's fill bar, and the ramp it is coloured with. Two screens read
 * ratios out loud — the storefront dashboard and analytics — and a bar drawn
 * twice is two bars that drift apart.
 */

/**
 * How full reads as a colour before it reads as a number: open, busy, nearly
 * full, full. One ramp for every fill on this page so the bars agree with the
 * headline state.
 */
export function fillTone(used: number, total: number) {
  if (total === 0) return { label: "Not configured", text: "text-stone-400", bar: "bg-stone-200" };
  const percent = (used / total) * 100;
  if (percent >= 100) return { label: "Full", text: "text-red-700", bar: "bg-red-400" };
  if (percent >= 85) return { label: "Nearly full", text: "text-orange-700", bar: "bg-orange-400" };
  if (percent >= 50) return { label: "Busy", text: "text-amber-700", bar: "bg-amber-400" };
  return { label: "Open", text: "text-emerald-700", bar: "bg-emerald-400" };
}

/**
 * A ratio as a fill bar, with its own label and figures sitting on the track.
 * A separate caption above a hairline bar was two things to read for one fact;
 * the fill sweeps in behind the words instead. The fills stop at the 400 step:
 * saturated enough to carry the state across the room, light enough that the
 * label on top of them still clears AA at any width.
 */
export function Meter({
  label,
  used,
  total,
  display,
  bar,
}: {
  label: string;
  used: number;
  total: number;
  /** What the numbers read as, when "3/8" is not the shop's phrasing. */
  display?: string;
  bar?: string;
}) {
  const percent = total === 0 ? 0 : Math.min(100, Math.round((used / total) * 100));
  return (
    <div
      className="relative h-7 overflow-hidden rounded-lg bg-well ring-1 ring-well-line"
      role="img"
      aria-label={`${label}: ${display ?? `${used} of ${total}`}`}
    >
      <div
        className={`absolute inset-y-0 left-0 ${bar ?? fillTone(used, total).bar}`}
        style={{ width: `${percent}%` }}
      />
      <div className="relative flex h-full items-center justify-between gap-2 px-2.5 text-xs">
        <span className="truncate font-bold text-stone-900">{label}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="tabular-nums font-bold text-stone-900">
            {display ?? (
              <>
                {used}
                <span className="font-medium text-stone-600">/{total}</span>
              </>
            )}
          </span>
          <span className="rounded-full bg-white/75 px-1.5 py-px text-[10px] font-black tabular-nums text-stone-700">
            {percent}%
          </span>
        </span>
      </div>
    </div>
  );
}
