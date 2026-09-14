import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { clock, summariseHours, todayLabel, type BusinessHours } from "@/lib/shop-hours";
import { formatSpecies } from "@/lib/utils";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Home" };

// Hours, prices and the walk-in window are all edited at runtime.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [config, services] = await Promise.all([
    getConfig(),
    prisma.service.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            take: 6,
    }),
  ]);

  const hours = (config.businessHours as BusinessHours) ?? {};
  const today = todayLabel(hours);
  const week = summariseHours(hours);

  return (
    <div>
      {/*
        The hero opens on the shop's own state — open or shut, walk-ins or not,
        what a groom actually costs. A stranger choosing where to take a nervous
          dog is deciding on those three things, and every one of them is already
          in the database. Claims about ourselves went the other way: "Family
        Owned" over an emoji was three tiles of something nobody can check.
      */}
      <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 pt-16 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:items-end md:gap-12 md:pb-20 md:pt-24">
        <div>
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
              Check pricing
          </Link>
        </div>
        </div>

        {/* Today, in the order someone standing on the pavement asks it. */}
        <div className="glass-panel glass-feature rounded-3xl p-6 md:p-7">
          {/* The header carries whether the shop is open right now; this is the
          other half — the hours it keeps today. */}
          {/* An <h2>, not a <p>: this is the panel's heading, and a styled
              paragraph leaves the page with nothing under the <h1> to navigate
              by. Preflight resets heading size and weight, so the classes
              render it identically. */}
          <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">{today}</h2>
          <dl className="mt-4 space-y-3 text-[0.95rem]">
            {config.featureWalkInPortal && config.walkInWindowStart && config.walkInWindowEnd && (
              <div>
                <dt className="text-muted">Walk-ins</dt>
                <dd className="font-semibold text-ink">
                  {clock(config.walkInWindowStart)} – {clock(config.walkInWindowEnd)}
                </dd>
              </div>
            )}
            {config.shopPhone && (
              <div>
                <dt className="text-muted">Phone</dt>
                <dd className="font-semibold">
                  <a href={`tel:${config.shopPhone.replace(/[^\d+]/g, "")}`} className="text-brand-text hover:underline">
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

          {/* The rest of the week is the second question, not the first. */}
          <details className="disclosure mt-4 border-t border-line/70 pt-3">
            <summary className="text-sm font-semibold text-brand-text">All opening hours</summary>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {week.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </div>
      </section>

      {/*
        The menu, without figures. Price depends on pet type, size and coat, so
        the pricing tool on /services is the only place that answers it —
        a "from" figure here is a number nobody is ever charged.
      */}
      {services.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-24">
          {/* The rule above the list is what a sighted reader takes as the
              break. Nothing carries it to a screen reader, so the heading is
              off-screen rather than absent. */}
          <h2 className="sr-only">Services</h2>
          <div className="border-t border-line pt-1">
            <ul className="divide-y divide-line/70">
              {services.map((service) => (
                <li key={service.id}>
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
          <p className="mt-3 px-1 text-sm text-muted">
            Coat, size and condition decide the price.{" "}
            <Link href="/services" className="text-brand-text underline underline-offset-2">
              Check pricing for your pet
            </Link>
          </p>
      </section>
      )}
    </div>
  );
}
