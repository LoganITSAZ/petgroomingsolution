import Link from "next/link";
import MobileMenu from "@/components/MobileMenu";
import { getConfig } from "@/lib/config";
import { resolveTheme, themeStyle } from "@/lib/themes";
import { SHOP_TIMEZONE } from "@/lib/utils";

// SystemConfig is edited at runtime from /admin, so these pages must not be
// baked at build time — a prerendered snapshot would freeze shop details,
// feature flags, waiver text and the site's theme until the next deploy.
export const dynamic = "force-dynamic";

const DAYS = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
  ["sunday", "Sun"],
] as const;

type Hours = Record<string, { open: string; close: string } | null>;

/** "8:00" → "8am", "15:30" → "3:30pm". */
function clock(value: string): string {
  const [hourRaw, minute] = value.split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "pm" : "am";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute && minute !== "00" ? `${twelve}:${minute}${suffix}` : `${twelve}${suffix}`;
}

/** Consecutive days with identical hours collapse into one line. */
function summariseHours(hours: Hours): string[] {
  const rows: { label: string; text: string }[] = [];

  for (const [key, label] of DAYS) {
    const day = hours?.[key] ?? null;
    const text = day ? `${clock(day.open)} – ${clock(day.close)}` : "Closed";
    const last = rows[rows.length - 1];
    if (last && last.text === text) {
      last.label = `${last.label.split("–")[0].trim()} – ${label}`;
    } else {
      rows.push({ label, text });
    }
  }

  return rows.map((row) => `${row.label}: ${row.text}`);
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const config = await getConfig();

  // The shop's own date decides the seasonal theme, not the visitor's.
  const shopDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);

  const theme = resolveTheme(config, { month: shopDate[1], day: shopDate[2] });
  const hours = summariseHours((config.businessHours as Hours) ?? {});

  return (
    <div style={themeStyle(theme.tokens)} className="public-shell min-h-screen flex flex-col text-ink">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {theme.bannerText && (
        <p className="bg-brand-700 text-brand-on-700 text-center text-sm py-1.5 px-4">
          {theme.preset.motif && <span className="mr-1.5">{theme.preset.motif}</span>}
          {theme.bannerText}
        </p>
      )}

      <header className="sticky top-0 z-50 px-3 pt-3">
        <div className="glass-panel max-w-6xl mx-auto flex h-14 items-center justify-between rounded-2xl px-4">
          <Link href="/" className="shrink-0 font-black tracking-tight text-lg text-brand-text transition-transform hover:scale-[1.02]">
            <span className="mr-1.5">{theme.preset.motif ?? "🐾"}</span>{config.shopName}
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 text-sm font-medium text-muted md:flex">
            <Link href="/about" className="rounded-lg px-2 py-2 hover:text-brand-text transition-colors">
              About
            </Link>
            <Link href="/services" className="rounded-lg px-2 py-2 hover:text-brand-text transition-colors">
              Services
            </Link>
            <Link href="/contact" className="rounded-lg px-2 py-2 hover:text-brand-text transition-colors">
              Contact
            </Link>
            {config.featureOnlineBooking && (
              <Link
                href="/portal"
                className="rounded-lg bg-brand-600 px-3 py-1.5 font-bold text-brand-on-600 shadow-md shadow-brand-900/20 transition hover:-translate-y-0.5 hover:bg-brand-700 hover:text-brand-on-700"
              >
                Book Now
              </Link>
            )}
          </nav>
          <MobileMenu
            className="md:hidden"
            label="Open main navigation"
            summaryClassName="bg-brand-600 px-3 py-2 text-brand-on-600"
            menuClassName="left-auto right-0 w-52 border border-line bg-surface text-ink shadow-xl"
          >
            <Link href="/about" className="block rounded-lg px-3 py-2.5 font-medium hover:bg-brand-100/40">About</Link>
            <Link href="/services" className="block rounded-lg px-3 py-2.5 font-medium hover:bg-brand-100/40">Services</Link>
            <Link href="/contact" className="block rounded-lg px-3 py-2.5 font-medium hover:bg-brand-100/40">Contact</Link>
            {config.featureOnlineBooking && <Link href="/portal" className="mt-1 block rounded-lg bg-brand-600 px-3 py-2.5 font-bold text-brand-on-600">Book Now</Link>}
          </MobileMenu>
        </div>
      </header>

      <main id="main-content" className="flex-1">{children}</main>

      <footer className="mt-8 bg-footer-bg text-footer-ink py-10">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <p className="font-bold text-white mb-1">
              {theme.preset.motif ?? "🐾"} {config.shopName}
            </p>
            <p className="italic opacity-80">Patience, Love &amp; Kindness</p>
          </div>
          <div>
            <p className="font-semibold text-white mb-1">Hours</p>
            {hours.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <div>
            <p className="font-semibold text-white mb-1">Contact</p>
            {config.shopPhone && <p>{config.shopPhone}</p>}
            {config.shopEmail && <p>{config.shopEmail}</p>}
            {config.shopAddress && <p>{config.shopAddress}</p>}
          </div>
        </div>
      </footer>
    </div>
  );
}
