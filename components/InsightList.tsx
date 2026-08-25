import Link from "next/link";
import type { Insight } from "@/lib/insights";

/**
 * Observations with their working shown. Every insight states the numbers it
 * came from, so staff can tell a real pattern from a coincidence.
 */

const TONE: Record<Insight["tone"], { border: string; dot: string; surface: string; title: string }> = {
  neutral: { border: "border-sky-200", dot: "bg-sky-500", surface: "bg-sky-50/70", title: "text-sky-950" },
  opportunity: { border: "border-emerald-200", dot: "bg-emerald-500", surface: "bg-emerald-50/70", title: "text-emerald-950" },
  warning: { border: "border-amber-300", dot: "bg-amber-500", surface: "bg-amber-50/80", title: "text-amber-950" },
};

export default function InsightList({
  insights,
  empty = "Nothing stands out yet — a few more visits and patterns start to show.",
  compact = false,
}: {
  insights: Insight[];
  empty?: string;
  compact?: boolean;
}) {
  if (insights.length === 0) {
    return <p className="text-sm text-stone-400">{empty}</p>;
  }

  return (
    <ul className={compact ? "space-y-1.5" : "space-y-2"}>
      {insights.map((insight) => {
        const tone = TONE[insight.tone];
        const body = (
          <>
            <span className="flex items-baseline gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot} shrink-0`} />
              <span className={`font-semibold ${tone.title}`}>{insight.title}</span>
            </span>
            <span className="block text-stone-600 pl-3.5">{insight.detail}</span>
            <span className="block text-xs text-stone-400 pl-3.5">{insight.evidence}</span>
          </>
        );

        return (
          <li
            key={insight.id}
            className={`text-sm border rounded-lg px-3 py-2 shadow-sm ${tone.border} ${tone.surface}`}
          >
            {insight.href ? (
              <Link href={insight.href} className="block hover:opacity-80">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
