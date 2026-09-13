import { AppointmentStatus } from "@prisma/client";
import { VISIT_STAGES, stageIndexFor } from "@/lib/appointment-flow";
import { formatStatus } from "@/lib/utils";

/**
 * How far a visit has got, drawn rather than named.
 *
 * The status badge said where a pet *is*; it never said what is left. Seven
 * segments — one per stage in `VISIT_STAGES` — fill as the visit walks the
 * flow, so a row can be read at a glance from across the counter. A visit that
 * is off the rail (cancelled, no-show) gets the word instead: there is no
 * progress to draw.
 */
export default function StageRail({
  status,
  showLabel = true,
  className = "",
}: {
  status: AppointmentStatus | string;
  showLabel?: boolean;
  className?: string;
}) {
  const index = stageIndexFor(status);

  if (index < 0) {
    return (
      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
        {formatStatus(status)}
      </span>
    );
  }

  const stage = VISIT_STAGES[index];
  const label = `${stage.label} — step ${index + 1} of ${VISIT_STAGES.length}`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={label}
      aria-label={label}
      role="img"
    >
      <span className="flex items-center gap-[2px]">
        {VISIT_STAGES.map((step, position) => (
          <span
            key={step.key}
            className={`h-1.5 rounded-full transition-colors ${
              position < index
                ? "w-1.5 bg-brand-600"
                : position === index
                  ? "w-4 bg-brand-600"
                  : "w-1.5 bg-stone-200"
            }`}
          />
        ))}
      </span>
      {showLabel && (
        <span className="whitespace-nowrap text-[10px] font-semibold tracking-tight text-stone-600">
          {stage.label}
        </span>
      )}
    </span>
  );
}
