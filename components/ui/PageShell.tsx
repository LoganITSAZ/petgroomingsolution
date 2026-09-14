import Link from "next/link";
import PageColumnsButton from "../PageColumnsButton";
import { cn } from "@/lib/utils";

/**
 * The back-office page shape, factored out of /staff/appointments.
 *
 * One page is one card. The title and everything the page owns —
 * toolbar, counts, panels, list — lives inside a single bordered surface,
 * divided by hairlines rather than floating as separate cards. Split across
 * cards the parts read as unrelated things scattered on the page; inside one
 * they read as one screen.
 */

export function PageShell({
  title,
  subtitle,
  center,
  actions,
  back,
  children,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Sits in the middle of the header, between the title and the actions. */
  center?: React.ReactNode;
  actions?: React.ReactNode;
  /** Where this page was opened from, on its own line above the title. */
  back?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-3">
      {back && (
        <Link
          href={back.href}
          className="text-sm text-muted hover:text-ink transition-colors -mb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-well-line/80 focus-visible:ring-offset-2"
        >
          ← {back.label}
        </Link>
      )}
      <section
        className={cn(
          "page-card bg-surface border border-line/80 rounded-xl shadow-card overflow-x-hidden overflow-y-auto [&>*:first-child]:border-t-0 [&>*:first-child]:shadow-none flex-1 min-h-0 min-w-0 flex flex-col",
          className
        )}
      >
        <header className="page-heading bg-band px-3 py-3 flex shrink-0 items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex items-baseline gap-x-3 gap-y-1 flex-wrap">
            <h1 className="font-display text-[1.6rem] font-extrabold leading-tight tracking-[-0.025em] text-ink break-words">
              {title}
            </h1>
            {subtitle && <span className="text-sm text-muted">{subtitle}</span>}
          </div>
          {center && (
            <div className="flex flex-1 basis-auto items-center justify-center">{center}</div>
          )}
          <div className="ml-auto flex items-center justify-end gap-2 flex-wrap">
            {actions}
            <PageColumnsButton />
          </div>
        </header>
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
  actions,
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
  actions?: React.ReactNode;
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
      data-page-section
      className={cn(
        "min-w-0 border-t border-well-line first:border-t-0",
        tone === "muted" && "bg-band shadow-[inset_0_1px_0_rgb(var(--well-line))]",
        grow && "flex-1 min-h-0 flex flex-col",
        className
      )}
    >
      {(title || hint || actions) && (
        <div
          className={cn(
            "section-heading flex items-center justify-between gap-3 flex-wrap px-3 py-1.5",
            // The heading reads as a label because the strip it sits on does.
            tone === "plain" && "bg-band border-b border-well-line"
          )}
        >
          {title && (
            <h2 className="font-display text-[0.75rem] font-bold uppercase tracking-[0.09em] text-muted">{title}</h2>
          )}
          {hint && <span className="text-xs text-muted">{hint}</span>}
          {actions && (
            <div className="ml-auto flex items-center justify-end gap-2 flex-wrap">
              {actions}
            </div>
          )}
        </div>
      )}
      <div
        className={cn(
          "min-w-0",
          padded && "px-3 py-3",
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
 * An inset list or summary surface. The shared glass-well finish stays
 * recessed, while Panel uses the brighter glass-tile material for summaries.
 * Both follow the shop palette and its light/dark surface tokens.
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
        "glass-well min-h-7 rounded-lg border border-well-line bg-well px-3 py-1.5",
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
        "glass-tile border border-well-line rounded-lg px-3 py-2 bg-well",
        className
      )}
    >
      <h3 className="font-display text-[0.8125rem] font-bold tracking-tight text-muted mb-1">{title}</h3>
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
        "glass-stat-strip bg-band border-t border-stone-100 first:border-t-0 px-3 py-2 flex flex-wrap gap-x-5 gap-y-0.5 text-sm text-muted",
        className
      )}
    >
      {stats.map(({ label, value }) => (
        <span key={label}>
          <span className="font-bold text-ink">{value}</span> {label.toLowerCase()}
        </span>
      ))}
    </div>
  );
}
