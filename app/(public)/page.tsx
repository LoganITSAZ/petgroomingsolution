import Link from "next/link";
import { getConfig } from "@/lib/config";

export default async function HomePage() {
  const config = await getConfig();

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 to-amber-100 py-24 px-4 text-center">
        <p className="text-brand-600 font-semibold text-lg mb-3 uppercase tracking-widest">
          Established 2015 · Northern Phoenix, AZ
        </p>
        <h1 className="text-5xl md:text-7xl font-black text-stone-900 mb-4">
          {config.shopName}
        </h1>
        <p className="text-2xl text-stone-600 mb-8 italic">
          &ldquo;The best and bubbliest groomer in town&rdquo;
        </p>
        <p className="text-xl text-stone-500 mb-10">Patience, Love & Kindness</p>
        <div className="flex gap-4 justify-center flex-wrap">
          {config.featureOnlineBooking && (
            <Link
              href="/portal"
              className="bg-brand-600 hover:bg-brand-700 text-white px-8 py-4 rounded-xl font-bold text-xl transition-colors"
            >
              Book an Appointment
            </Link>
          )}
          <Link
            href="/services"
            className="border-2 border-stone-300 hover:border-brand-400 text-stone-700 px-8 py-4 rounded-xl font-bold text-xl transition-colors"
          >
            View Services & Pricing
          </Link>
        </div>
      </section>

      {/* Why us */}
      <section className="max-w-5xl mx-auto px-4 py-20 grid md:grid-cols-3 gap-10 text-center">
        {[
          { emoji: "🐶", title: "Dogs & Cats", body: "Expert grooming for all breeds, sizes, and temperaments." },
          { emoji: "❤️", title: "Family Owned", body: "We treat every pet like our own. Same team since 2015." },
          { emoji: "📍", title: "Northern Phoenix", body: "Conveniently located at 8911 N Central Ave #104." },
        ].map(({ emoji, title, body }) => (
          <div key={title} className="flex flex-col items-center gap-3">
            <span className="text-5xl">{emoji}</span>
            <h2 className="text-xl font-bold text-stone-900">{title}</h2>
            <p className="text-stone-500">{body}</p>
          </div>
        ))}
      </section>
    </>
  );
}
