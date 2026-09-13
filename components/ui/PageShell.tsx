import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The back-office page shape, factored out of /staff/appointments.
 *
 * One page is one card. The title sits above it; everything the page owns —
 * toolbar, counts, panels, list — lives inside a single bordered surface,
 * divided by hairlines rather than floating as separate cards. Split across
 * cards the parts read as unrelated things scattered on the page; inside one
 * they read as one screen.
 */

export function PageShell({
  title,
  subtitle,
  actions,
  back,
  children,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Where this page was opened from, on its own line above the title. */
  back?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {back && (
        <Link
          href={back.href}
          className="text-sm text-stone-500 hover:text-stone-800 transition-colors -mb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-well-line/80 focus-visible:ring-offset-2"
        >
          ← {back.label}
        </Link>
      )}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[1.6rem] font-extrabold leading-none tracking-[-0.025em] text-stone-900">
            {title}
          </h1>
          {subtitle && <span className="text-sm text-stone-500">{subtitle}</span>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    <section
      className={cn(
        "bg-white border border-stone-200/80 rounded-xl shadow-card ring-1 ring-well-line/80 overflow-hidden flex-1 min-h-0 flex flex-col",
        className
      )}
    >
      {children}
    </section>
    </div>
  );
}

/**
 * A band inside the parent card. Every band after the first draws its own top
 * hairline, so order is the only thing a page has to get right.
 *
 * `tone`: "plain" for content, "muted" for a toolbar/summary strip.
 * `grow`: the band that takes the leftover height and scrolls inside itself.
 */
export function PageSection({
  title,
  hint,
  tone = "plain",
  grow = false,
  scroll = false,
  padded = true,
  className,
  bodyClassName,
  bodyStyle,
  children,
}: {
  title?: string;
  hint?: React.ReactNode;
  tone?: "plain" | "muted";
  grow?: boolean;
  scroll?: boolean;
  padded?: boolean;
  className?: string;
  bodyClassName?: string;
  /** Inline styles for the body — a grid template the class list cannot express. */
  bodyStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-t border-stone-100 first:border-t-0",
        tone === "muted" && "bg-band shadow-[inset_0_1px_0_rgb(var(--well-line))]",
        grow && "flex-1 min-h-0 flex flex-col",
        className
      )}
    >
      {(title || hint) && (
        <div className="flex items-baseline justify-between gap-3 px-3 pt-3">
          {title && (
            <h2 className="font-display text-[0.8125rem] font-bold tracking-tight text-stone-600">{title}</h2>
          )}
          {hint && <span className="text-xs text-stone-400">{hint}</span>}
        </div>
      )}
      <div
        className={cn(
          padded && (title || hint ? "px-3 pb-3 pt-2" : "px-3 py-3"),
          grow && "flex-1 min-h-0",
          scroll && "overflow-auto",
          bodyClassName
        )}
        style={bodyStyle}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A well: the inset a list, a summary or a set of figures sits in. It is a
 * recess in the page card, not a second card — one fill, one hairline, no
 * shadow. `bg-well` is a token (app/globals.css) so the shop's whole back
 * office changes depth in one edit, and dark mode flips it with the variable.
 *
 * Empty is empty: a well with nothing in it keeps one line of height and says
 * nothing, which reads as "nothing here" without wording it.
 */
export function Well({
  as = "div",
  className,
  children,
}: {
  /** `ul` when the well holds a list, which most of them do. */
  as?: "div" | "ul";
  className?: string;
  children: React.ReactNode;
}) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        "min-h-7 rounded-lg border border-well-line bg-well px-3 py-1.5 ring-1 ring-well-line/60",
        className
      )}
    >
      {children}
    </Tag>
  );
}

/** The small titled box used inside a section — the summary cards pattern. */
export function Panel({
  title,
  children,
  className,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border border-well-line rounded-lg px-3 py-2 bg-well ring-1 ring-well-line/60",
        className
      )}
    >
      <h3 className="font-display text-[0.8125rem] font-bold tracking-tight text-stone-600 mb-1">{title}</h3>
      {children}
    </div>
  );
}

/** A row of figures, the shape the appointments toolbar uses for its counts. */
export function StatStrip({
  stats,
  className,
}: {
  stats: { label: string; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-band border-t border-stone-100 first:border-t-0 px-3 py-2 flex flex-wrap gap-x-5 gap-y-0.5 text-sm text-stone-500",
        className
      )}
    >
      {stats.map(({ label, value }) => (
        <span key={label}>
          <span className="font-bold text-stone-800">{value}</span> {label.toLowerCase()}
        </span>
      ))}
    </div>
  );
}
