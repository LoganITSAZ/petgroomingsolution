import { publicMetadata } from "@/lib/seo";
import { seoOverride } from "@/lib/seo-pages";
import { geocode } from "@/lib/maps";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { shopState, type BusinessHours } from "@/lib/shop-hours";
import PublicWeeklyHours from "@/components/PublicWeeklyHours";
import PublicShopStatus from "@/components/PublicShopStatus";
import { isEnabled } from "@/lib/features";
import OfficeIcon from "@/components/OfficeIcon";
import Stars from "@/components/Stars";
import VisitCardPanels from "@/components/VisitCardPanels";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export async function generateMetadata() {
  const config = await getConfig();
  // The city in the title comes from the same cached lookup the maps use.
  return publicMetadata(config, "/", await seoOverride("/"), await geocode(config.shopAddress));
}

// Hours, testimonials and the walk-in window are all edited at runtime.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [config, approved] = await Promise.all([
    getConfig(),
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
  const state = shopState(hours);

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
          <p className="public-eyebrow mb-5">Gentle pet grooming</p>
          <h1 className="font-display text-[clamp(3rem,9vw,5.5rem)] font-extrabold leading-[0.92] tracking-[-0.035em] text-ink">
          {config.shopName}
        </h1>
        {config.shopTagline && (
          <p className="mt-5 max-w-[34ch] text-xl leading-relaxed text-muted md:text-2xl">
            {config.shopTagline}
          </p>
        )}
        <p className="mt-2 max-w-[34ch] text-lg text-muted">Patience, Love &amp; Kindness</p>
        {config.shopAddress?.trim() && <p className="mt-4 max-w-prose text-muted">Welcoming pets and their people from within 20 miles of {config.shopAddress.trim()}. Explore our <Link href="/services" className="underline">grooming services and pricing</Link> to plan your visit.</p>}
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

        <div className="glass-panel glass-feature public-visit-card overflow-hidden rounded-3xl">
          <div className="public-visit-heading">
            <span className="public-visit-icon"><OfficeIcon name="paw" /></span>
            <div>
              <p className="public-eyebrow">We look forward to meeting you</p>
              <h2 className="public-visit-title text-ink">Plan your visit</h2>
            </div>
          </div>

          <VisitCardPanels
            hours={
              <div className="p-6 md:p-7">
                <h3 className="mb-4 text-lg font-semibold text-ink">Weekly opening hours</h3>
                {state ? (
                  <PublicWeeklyHours config={config} />
                ) : (
                  <p className="text-sm text-muted">Please contact the shop for opening hours.</p>
                )}
              </div>
            }
          >
          <div className="p-6 md:p-7">
            <PublicShopStatus config={config} />

          </div>

          {(config.shopPhone || config.shopAddress) && (
            <div className="space-y-5 border-t border-line/70 p-6 md:p-7">
              {config.shopAddress && (
                <div>
                  <p className="text-sm text-muted">Find us</p>
                  <p className="mt-1 break-words font-medium leading-relaxed text-ink">{config.shopAddress}</p>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(config.shopAddress)}`}
                    className="public-text-link"
                  >
                    Get directions <span aria-hidden="true">↗</span>
                  </a>
                </div>
              )}
              {config.shopPhone && (
                <div>
                  <p className="text-sm text-muted">Questions before your visit?</p>
                  <a
                    href={`tel:${config.shopPhone.replace(/[^\d+]/g, "")}`}
                    className="mt-1 inline-flex min-h-11 items-center break-all text-lg font-semibold text-brand-text hover:underline"
                  >
                    {config.shopPhone}
                  </a>
                </div>
              )}
            </div>
          )}
          </VisitCardPanels>
        </div>
      </section>

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

    </div>
  );
}
