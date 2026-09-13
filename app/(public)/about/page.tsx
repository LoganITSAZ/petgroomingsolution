import { getConfig } from "@/lib/config";
import Link from "next/link";

export async function generateMetadata() {
  const config = await getConfig();
  return {
    title: `About Us | ${config.shopName}`,
    description: `Learn about the care philosophy and team behind ${config.shopName}.`,
  };
}

export default async function AboutPage() {
  const config = await getConfig();

  return (
    <div className="public-shell min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24 text-brand-on-700">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900" />
        <div className="absolute -right-20 top-0 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-12 text-[13rem] leading-none text-white/[0.07]" aria-hidden="true">🐾</div>
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="mb-5 text-sm font-semibold tracking-tight text-brand-on-700">
            Professional Pet Grooming
          </p>
          <h1 className="text-4xl font-black leading-tight md:text-6xl">
            About {config.shopName}
          </h1>
          <p className="mt-3 text-brand-on-700 text-lg max-w-2xl mx-auto leading-relaxed">
            Where every pet is treated with patience, care, and a whole lot of love.
          </p>
          <div className="mx-auto mt-8 h-px w-20 bg-white/40" />
        </div>
      </section>

      {/* Our Story */}
      {/*
        One page, one panel. The story, what the shop stands for and the way
        out to the services were three surfaces stacked down the page; they are
        bands of one panel now.
      */}
      <section className="px-6 py-16">
        <div className="glass-panel mx-auto max-w-3xl overflow-hidden rounded-3xl">
          <div className="p-7 md:p-10">
          <p className="public-eyebrow mb-4">The Gentle Groomer way</p>
          <h2 className="public-section-title mb-5">Our Story</h2>
          <div className="space-y-4 text-muted leading-relaxed">
            <p>
              {config.shopName ?? "Gentle Groomer"} was founded on a simple belief: every pet
              deserves to be groomed by someone who genuinely loves animals. We started as a small,
              single-table operation and have grown into a trusted neighborhood grooming studio — but
              our approach has never changed.
            </p>
            <p>
              We take our time. We don&apos;t rush your pet through the process. From the first
              brush stroke to the final spritz, we pay attention to how your pet is feeling and
              adjust our approach accordingly. Nervous animals, elderly pets, and first-timers all
              get the same patient, gentle handling.
            </p>
            <p>
              Our groomers are experienced, passionate, and committed to continuing education — so
              your pet always gets the benefit of the latest techniques and best practices in pet
              care.
            </p>
          </div>
          <div className="mt-8 grid gap-3 border-t border-line pt-6 sm:grid-cols-3">
            {[
              ["A gentler pace", "Time and attention for every visit."],
              ["Experienced hands", "Thoughtful care from start to finish."],
              ["Comfort first", "A calm approach for every personality."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl bg-brand-100/25 p-4">
                <p className="text-sm font-bold text-ink">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
              </div>
            ))}
          </div>
          </div>

          {/* The way out, as the panel's last band rather than a card of its own. */}
          <div className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 px-6 py-12 text-center text-brand-on-700">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.22),transparent_48%)]" />
            <div className="relative">
              <p className="mb-3 text-xs font-bold tracking-tight text-brand-on-700">A calm visit starts here</p>
              <h2 className="mb-2 text-2xl font-black">See what we offer</h2>
              <p className="mb-6 text-sm text-brand-on-700">
                Browse our grooming, bathing and add-on services with current pricing.
              </p>
              <Link
                href="/services"
                className="inline-flex items-center justify-center rounded-xl bg-surface px-7 py-3 text-sm font-bold text-brand-text shadow-lg transition hover:-translate-y-0.5 hover:bg-brand-100/40"
              >
                View Our Services
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
