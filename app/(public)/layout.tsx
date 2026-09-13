import Link from "next/link";
import MobileMenu from "@/components/MobileMenu";
import { getConfig } from "@/lib/config";
import { headers } from "next/headers";
import PublicThemeToggle, { NO_FLASH_SCRIPT } from "@/components/PublicThemeToggle";
import { resolveTheme, themeCss } from "@/lib/themes";
import { SHOP_TIMEZONE } from "@/lib/utils";
import { shopState, summariseHours, type BusinessHours } from "@/lib/shop-hours";

// SystemConfig is edited at runtime from /admin, so these pages must not be
// baked at build time — a prerendered snapshot would freeze shop details,
// feature flags, waiver text and the site's theme until the next deploy.
export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const config = await getConfig();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

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
  const businessHours = (config.businessHours as BusinessHours) ?? {};
  const hours = summariseHours(businessHours);
  const state = shopState(businessHours);

  return (
    // The pre-paint script below adds `dark` to this element before React
    // hydrates, so its className is expected to differ from the server's.
    <div
      id="public-root"
      suppressHydrationWarning
      className="public-shell min-h-screen flex flex-col text-ink"
    >
      {/* Both halves of the theme. An element has one style attribute, so the
          dark set cannot ride along inline — see themeCss(). */}
      <style dangerouslySetInnerHTML={{ __html: themeCss(theme.tokens) }} />
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />

      {/*
        The refraction half of the glass. feTurbulence generates a slow fractal
        field and feDisplacementMap bends the backdrop by it, so the background
        shifts where a panel's edge crosses it. The three passes run the same
        field at falling strengths and keep one colour channel each — that
        split is the chromatic fringe real glass throws at its rim. Referenced
        from .glass-panel in globals.css; browsers without displacement on a
        backdrop simply ignore the url() and keep the blur.
      */}
      <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute h-0 w-0">
        <defs>
          <filter id="liquid-glass" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.007 0.011" numOctaves={2} seed={7} result="field" />
            <feDisplacementMap in="SourceGraphic" in2="field" scale={26} xChannelSelector="R" yChannelSelector="G" result="red" />
            <feDisplacementMap in="SourceGraphic" in2="field" scale={18} xChannelSelector="R" yChannelSelector="G" result="green" />
            <feDisplacementMap in="SourceGraphic" in2="field" scale={10} xChannelSelector="R" yChannelSelector="G" result="blue" />
            <feColorMatrix in="red" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="redOnly" />
            <feColorMatrix in="green" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="greenOnly" />
            <feColorMatrix in="blue" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blueOnly" />
            <feBlend in="redOnly" in2="greenOnly" mode="screen" result="rg" />
            <feBlend in="rg" in2="blueOnly" mode="screen" />
          </filter>

          <filter id="liquid-glass-subtle" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.009 0.013" numOctaves={2} seed={3} result="field" />
            <feDisplacementMap in="SourceGraphic" in2="field" scale={12} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

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
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="font-display shrink-0 truncate text-lg font-extrabold tracking-[-0.02em] text-brand-text">
            <span className="mr-1.5" aria-hidden="true">{theme.preset.motif ?? "🐾"}</span>{config.shopName}
          </Link>
            {state && (
              <span className="hidden items-center gap-1.5 text-sm text-muted sm:flex">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${state.open ? "bg-signal-open" : "bg-signal-shut"}`}
                />
                {state.label}
              </span>
            )}
          </div>
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
            <PublicThemeToggle className="ml-1" />
          </nav>
          <PublicThemeToggle className="md:hidden mr-1 ml-auto" />
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
            <p className="font-display text-lg font-extrabold text-white mb-1">
              <span aria-hidden="true">{theme.preset.motif ?? "🐾"}</span> {config.shopName}
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
