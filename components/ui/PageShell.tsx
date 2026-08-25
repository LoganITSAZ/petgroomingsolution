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
          className="text-sm text-stone-500 hover:text-stone-800 transition-colors -mb-1"
        >
          ← {back.label}
        </Link>
      )}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-black text-stone-900">{title}</h1>
          {subtitle && <span className="text-sm text-stone-500">{subtitle}</span>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <PageCard className={className}>{children}</PageCard>
    </div>
  );
}

/** The parent surface. Scrolling happens in whichever section asks for it. */
export function PageCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "bg-white border border-stone-200 rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col",
        className
      )}
    >
      {children}
    </section>
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
        tone === "muted" && "bg-stone-50",
        grow && "flex-1 min-h-0 flex flex-col",
        className
      )}
    >
      {(title || hint) && (
        <div className="flex items-baseline justify-between gap-3 px-3 pt-3">
          {title && (
            <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest">{title}</h2>
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
    <div className={cn("border border-stone-200 rounded-lg px-3 py-2 bg-stone-50/60", className)}>
      <h3 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-1">{title}</h3>
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
        "bg-stone-50 border-t border-stone-100 first:border-t-0 px-3 py-2 flex flex-wrap gap-x-5 gap-y-0.5 text-sm text-stone-500",
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
