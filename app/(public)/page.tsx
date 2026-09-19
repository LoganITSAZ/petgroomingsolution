import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { clock, shopState, summariseHours, todayLabel, type BusinessHours } from "@/lib/shop-hours";
import { formatSpecies, isWithinWalkInWindow } from "@/lib/utils";
import { isEnabled } from "@/lib/features";
import OfficeIcon from "@/components/OfficeIcon";
import Stars from "@/components/Stars";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Home" };

// Hours, prices and the walk-in window are all edited at runtime.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [config, services, approved] = await Promise.all([
    getConfig(),
    prisma.service.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 6,
    }),
    // Approved and still wanted. An unapproved row is one nobody has read.
    prisma.testimonial.findMany({
      where: { isActive: true, approvedAt: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 3,
    }),
  ]);

  // Gated after the query rather than before it: the config comes back in the
  // same round trip, so a conditional read would need a second one.
  const testimonials = isEnabled(config, "featureTestimonials") ? approved : [];

  const hours = (config.businessHours as BusinessHours) ?? {};
  const today = todayLabel(hours);
  const week = summariseHours(hours);
  const state = shopState(hours);
  // Walk-ins are only a real option while the window is actually running.
  const walkIn =
    config.featureWalkInPortal && config.walkInWindowStart && config.walkInWindowEnd
      ? {
          label: `${clock(config.walkInWindowStart)} – ${clock(config.walkInWindowEnd)}`,
          now: isWithinWalkInWindow(config.walkInWindowStart, config.walkInWindowEnd),
        }
      : null;

  return (
    <div>
      {/*
        The hero opens on the shop's own state — open or shut, and whether
        walk-ins are running. A stranger choosing where to take a nervous dog
        is deciding on that, and it is already in the database. Claims about
        ourselves went the other way: "Family Owned" over an emoji was three
        tiles of something nobody can check. Figures stay off this page: the
        price of a groom depends on the pet, so /services answers it.
      */}
      <section className="public-hero mx-auto grid max-w-6xl gap-8 px-4 pb-16 pt-16 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:items-end md:gap-12 md:pb-20 md:pt-24">
        <div>
          <p className="public-eyebrow mb-5">Care at a gentler pace</p>
          <h1 className="font-display text-[clamp(3rem,9vw,5.5rem)] font-extrabold leading-[0.92] tracking-[-0.035em] text-ink">
          {config.shopName}
        </h1>
        {config.shopTagline && (
          <p className="mt-5 max-w-[34ch] text-xl leading-relaxed text-muted md:text-2xl">
            {config.shopTagline}
          </p>
        )}
        <p className="mt-2 max-w-[34ch] text-lg text-muted">Patience, Love &amp; Kindness</p>
        <div className="mt-8 flex flex-wrap gap-3">
          {config.featureOnlineBooking && (
              <Link href="/portal" className="public-primary-button px-7 py-3.5 text-lg">
                Book an appointment
            </Link>
          )}
            <Link href="/services" className="public-secondary-button px-7 py-3.5 text-lg">
              See our services
          </Link>
        </div>
        </div>

        {/*
          One panel, three bands, in the order the answer matters: whether
          anyone is here right now, what today's hours are, and only then how
          to reach us. The header's open/shut dot is hidden below `sm`, so on a
          phone this was the only hours information on the page and it read the
          same at 2am as at noon — phone and address under "Today 8am – 5pm"
          with nothing saying the shop was shut.
        */}
        <div className="glass-panel glass-feature public-visit-card overflow-hidden rounded-3xl">
          <div className="public-visit-heading"><span className="public-visit-icon"><OfficeIcon name="paw" /></span><div><p className="public-eyebrow">A little planning, a gentler visit</p><p className="public-visit-title">Come on in.</p></div></div>
          <div className="p-6 md:p-7">
            {/* An <h2>, not a <p>: this is the panel's heading, and a styled
                paragraph leaves the page with nothing under the <h1> to
                navigate by. Preflight resets heading size and weight, so the
                classes render it identically. */}
            <h2 className="font-display flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-ink">
              {state && (
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    state.open ? "bg-signal-open" : "bg-signal-shut"
                  }`}
                />
              )}
              {state ? state.label : today}
            </h2>
            {state && <p className="mt-1.5 text-[0.95rem] text-muted">{today}</p>}

            {walkIn && (
              <p
                className={`mt-4 rounded-2xl px-3.5 py-2.5 text-[0.95rem] ${
                  walkIn.now ? "bg-brand-100/40 text-ink" : "bg-surface/60 text-muted"
                }`}
              >
                <span className="font-semibold">Walk-ins</span> {walkIn.label}
                {walkIn.now && " · open now"}
              </p>
            )}
          </div>

          {/*
            Two panes that swap rather than stack. `name` makes these a native
            exclusive accordion — opening one closes the other, with no state
            and no JS — so the panel shows one pane at a time and the page below
            does not jump when the week is opened. The min-height holds the box
            steady across the swap; browsers without `name` (pre-2024) simply
            let both open, which degrades to the old growing panel.
          */}
          <div className={`border-t border-line/70 ${config.shopPhone || config.shopAddress ? "sm:min-h-[13.5rem]" : ""}`}>
            {(config.shopPhone || config.shopAddress) && (
              <details name="home-hours" open className="disclosure px-6 py-3 md:px-7">
                <summary className="text-sm font-semibold text-brand-text">Phone and address</summary>
                <dl className="mt-3 space-y-3 text-[0.95rem]">
                  {config.shopPhone && (
                    <div>
                      <dt className="text-muted">Phone</dt>
                      <dd className="font-semibold">
                        <a
                          href={`tel:${config.shopPhone.replace(/[^\d+]/g, "")}`}
                          className="text-brand-text hover:underline"
                        >
                          {config.shopPhone}
                        </a>
                      </dd>
                    </div>
                  )}
                  {config.shopAddress && (
                    <div>
                      <dt className="text-muted">Find us</dt>
                      <dd className="font-semibold text-ink">{config.shopAddress}</dd>
                    </div>
                  )}
                </dl>
                {state && !state.open && (
                  <p className="mt-3 pb-1 text-sm text-muted">
                    Nobody is in the shop right now — leave a message and we will call back when we
                    open.
                  </p>
                )}
              </details>
            )}

            <details name="home-hours" className="disclosure border-t border-line/70 px-6 py-3 md:px-7">
              <summary className="text-sm font-semibold text-brand-text">All opening hours</summary>
              <ul className="mt-3 space-y-1 pb-1 text-sm text-muted">
                {week.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      </section>

      {/*
        The menu, without figures. Price depends on pet type, size and coat,
        so /services is the only place that answers it — a "from" figure here
        is a number nobody is ever charged.
      */}
      {/*
        What other people's dogs got, in their owners' words. A stranger
        choosing where to take a nervous pet is reading this, not a price
        list — the figures were never here, and /services carries them.
      */}
      {testimonials.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-24">
          <h2 className="public-section-title mb-8">Kind words from our customers</h2>
          <div className="border-t border-line pt-9">
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((testimonial) => (
                // Each quote gets its own card in the site's glass. The
                // section is bare rather than a panel, so these are the
                // panel — not a second one nested inside somebody else's.
                <li
                  key={testimonial.id}
                  className="glass-panel-subtle flex h-full flex-col rounded-3xl p-6 md:p-7"
                >
                  {/* A <blockquote>, not a styled <p>: the quote marks are
                      decoration, and the element is what says these are
                      somebody else's words. */}
                  <blockquote className="flex-1 font-display text-lg leading-relaxed text-ink">
                    &ldquo;{testimonial.quote}&rdquo;
                  </blockquote>
                  <footer className="mt-6 flex items-end justify-between gap-3 border-t border-line/70 pt-4">
                    <p className="min-w-0 text-sm">
                      <span className="block truncate font-semibold text-ink">
                        {testimonial.author}
                      </span>
                      {testimonial.petName && (
                        <span className="block truncate text-muted">{testimonial.petName}</span>
                      )}
                    </p>
                    {testimonial.rating !== null && (
                      <Stars rating={testimonial.rating} className="shrink-0 text-sm" />
                    )}
                  </footer>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Keep service discovery available alongside customer reviews. */}
      {services.length > 0 && (
        <section className="public-services mx-auto max-w-6xl px-4 pb-24">
          <div className="public-section-intro"><div><p className="public-eyebrow mb-3">Care for every coat</p><h2 className="public-section-title mb-8">A little care. A lovely difference.</h2></div><Link href="/services" className="public-text-link">Explore services <span aria-hidden="true">↗</span></Link></div>
          <div className="border-t border-line pt-1">
            <ul className="public-service-grid">
              {services.map((service) => (
                <li key={service.id} className="public-service-card">
                  <span className="public-service-icon"><OfficeIcon name="paw" /></span>
                  {/* A row that has more to say opens; one that does not stays a
                      row, rather than a chevron that reveals nothing. */}
                  {service.description ? (
                    <details className="disclosure">
                      <summary className="py-3.5 text-ink">
                        <span className="font-display text-lg font-bold tracking-tight md:text-xl">
                          {service.name}
                        </span>
                        <span className="text-sm text-muted">
                          {service.species ? formatSpecies(service.species) : "Dogs & cats"} · {service.durationMins} min
                        </span>
                      </summary>
                      <p className="max-w-[60ch] pb-4 text-[0.95rem] leading-relaxed text-muted">
                        {service.description}
                      </p>
                    </details>
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3.5">
                      <span className="font-display text-lg font-bold tracking-tight text-ink md:text-xl">
                        {service.name}
                      </span>
                      <span className="text-sm text-muted">
                        {service.species ? formatSpecies(service.species) : "Dogs & cats"} · {service.durationMins} min
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
      </section>
      )}
    </div>
  );
}
