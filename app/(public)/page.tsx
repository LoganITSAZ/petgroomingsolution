import Link from "next/link";
import { getConfig } from "@/lib/config";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Home" };

export default async function HomePage() {
  const config = await getConfig();

  return (
    <div className="public-shell">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-24 pt-28 text-center md:pb-32 md:pt-36">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-full bg-gradient-to-b from-brand-100/40 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-4xl">
        <p className="public-eyebrow mb-5">
          Established 2015 · Northern Phoenix, AZ
        </p>
        <h1 className="mb-4 text-5xl font-black tracking-tight text-ink md:text-7xl">
          {config.shopName}
        </h1>
        {config.shopTagline && (
          <p className="mb-8 text-xl italic text-muted md:text-2xl">
            &ldquo;{config.shopTagline}&rdquo;
          </p>
        )}
        <p className="mb-10 text-lg text-muted md:text-xl">Patience, Love &amp; Kindness</p>
        <div className="flex flex-wrap justify-center gap-3">
          {config.featureOnlineBooking && (
            <Link
              href="/portal"
              className="public-primary-button px-8 py-4 text-lg"
            >
              Book an Appointment
            </Link>
          )}
          <Link
            href="/services"
            className="public-secondary-button px-8 py-4 text-lg"
          >
            View Services & Pricing
          </Link>
        </div>
        </div>
      </section>

      {/* Why us */}
      <section className="relative z-10 mx-auto -mt-12 grid max-w-5xl gap-4 px-4 pb-20 md:grid-cols-3">
        {[
          { emoji: "🐶", title: "Dogs & Cats", body: "Expert grooming for all breeds, sizes, and temperaments." },
          { emoji: "❤️", title: "Family Owned", body: "We treat every pet like our own. Same team since 2015." },
          { emoji: "📍", title: "Northern Phoenix", body: "Conveniently located at 8911 N Central Ave #104." },
        ].map(({ emoji, title, body }) => (
          <div key={title} className="glass-panel rounded-3xl p-7 text-center transition duration-200 hover:-translate-y-1 hover:shadow-2xl">
            <span className="mb-4 block text-5xl">{emoji}</span>
            <h2 className="text-xl font-black text-ink">{title}</h2>
            <p className="mt-2 text-muted">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
