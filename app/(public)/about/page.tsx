import { getConfig } from "@/lib/config";
import Link from "next/link";

const SERVICE_LIST = [
  {
    name: "Bath & Tidy",
    description: "Full bath, blow-dry, brush out, and a light trim around the face, feet, and tail.",
  },
  {
    name: "Bath & Trim",
    description: "Everything in the Bath & Tidy, plus a complete body trim to your pet's preferred style.",
  },
  {
    name: "Full Groom",
    description: "Comprehensive styling cut, full bath, blow-dry, ear cleaning, and nail trim.",
  },
  {
    name: "Lion Cut",
    description: "Specialty service for cats — shaved body with a fluffy mane, paws, and tail tip.",
  },
  {
    name: "Nail Trim & Grind",
    description: "Quick, stress-free nail maintenance to keep paws healthy and floors scratch-free.",
  },
  {
    name: "À La Carte Add-ons",
    description: "Ear cleaning, teeth brushing, gland expression, and more — bookable alongside any service.",
  },
];

const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

export const metadata = {
  title: "About Us | Gentle Groomer",
  description: "Learn about Gentle Groomer — our story, our services, and where to find us.",
};

export default async function AboutPage() {
  const config = await getConfig();

  const businessHours = config.businessHours as Record<
    string,
    { open: string; close: string } | null
  > | null;

  return (
    <main className="bg-stone-50 min-h-screen">
      {/* Hero */}
      <section className="bg-amber-700 text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-amber-300 text-sm font-semibold uppercase tracking-widest mb-3">
            Professional Pet Grooming
          </p>
          <h1 className="text-4xl md:text-5xl font-black leading-tight">
            About {config.shopName ?? "Gentle Groomer"}
          </h1>
          <p className="mt-5 text-amber-100 text-lg max-w-2xl mx-auto leading-relaxed">
            Where every pet is treated with patience, care, and a whole lot of love.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/book"
              className="bg-white text-amber-700 hover:bg-amber-50 px-6 py-3 rounded-xl font-bold text-sm transition-colors"
            >
              Book an Appointment
            </Link>
            <Link
              href="/contact"
              className="border border-amber-300 text-white hover:bg-amber-600 px-6 py-3 rounded-xl font-bold text-sm transition-colors"
            >
              Get in Touch
            </Link>
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-black text-stone-900 mb-5">Our Story</h2>
          <div className="space-y-4 text-stone-600 leading-relaxed">
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
        </div>
      </section>

      {/* Services */}
      <section className="bg-white border-t border-b border-stone-200 py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-black text-stone-900 mb-2">Our Services</h2>
          <p className="text-stone-500 mb-8">
            We offer a full range of grooming services for dogs and cats of all breeds and sizes.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {SERVICE_LIST.map((svc) => (
              <div
                key={svc.name}
                className="flex gap-4 items-start p-4 rounded-xl border border-stone-100 hover:border-amber-200 hover:bg-amber-50 transition-colors"
              >
                <div className="w-8 h-8 flex-shrink-0 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-black text-sm mt-0.5">
                  ✦
                </div>
                <div>
                  <p className="font-bold text-stone-900">{svc.name}</p>
                  <p className="text-sm text-stone-500 mt-0.5 leading-relaxed">{svc.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/book"
              className="inline-block bg-amber-600 hover:bg-amber-700 text-white px-7 py-3 rounded-xl font-bold text-sm transition-colors"
            >
              Book a Service
            </Link>
          </div>
        </div>
      </section>

      {/* Location & Hours */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Location */}
          <div>
            <h2 className="text-2xl font-black text-stone-900 mb-5">Find Us</h2>
            <div className="space-y-3 text-stone-600">
              {config.shopAddress && (
                <div className="flex items-start gap-3">
                  <span className="text-amber-600 mt-0.5">📍</span>
                  <span className="leading-relaxed">{config.shopAddress}</span>
                </div>
              )}
              {config.shopPhone && (
                <div className="flex items-center gap-3">
                  <span className="text-amber-600">📞</span>
                  <a
                    href={`tel:${config.shopPhone}`}
                    className="hover:text-amber-700 underline underline-offset-2"
                  >
                    {config.shopPhone}
                  </a>
                </div>
              )}
              {config.shopEmail && (
                <div className="flex items-center gap-3">
                  <span className="text-amber-600">✉</span>
                  <a
                    href={`mailto:${config.shopEmail}`}
                    className="hover:text-amber-700 underline underline-offset-2"
                  >
                    {config.shopEmail}
                  </a>
                </div>
              )}
              {config.shopWebsite && (
                <div className="flex items-center gap-3">
                  <span className="text-amber-600">🌐</span>
                  <a
                    href={config.shopWebsite}
                    className="hover:text-amber-700 underline underline-offset-2"
                  >
                    {config.shopWebsite.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}
            </div>
            <div className="mt-6">
              <Link
                href="/contact"
                className="inline-block border border-amber-400 text-amber-700 hover:bg-amber-50 px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors"
              >
                Send us a message →
              </Link>
            </div>
          </div>

          {/* Hours */}
          <div>
            <h2 className="text-2xl font-black text-stone-900 mb-5">Hours</h2>
            {businessHours ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-stone-100">
                  {Object.entries(DAY_LABELS).map(([key, label]) => {
                    const hours = businessHours[key];
                    return (
                      <tr key={key}>
                        <td className="py-2 pr-4 font-medium text-stone-700 w-32">{label}</td>
                        <td className="py-2 text-stone-500">
                          {hours ? (
                            <span>
                              {formatTime(hours.open)} – {formatTime(hours.close)}
                            </span>
                          ) : (
                            <span className="text-stone-400">Closed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-stone-400 text-sm">
                Please call or visit our contact page for current hours.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* CTA footer band */}
      <section className="bg-amber-700 text-white py-12 px-6 text-center">
        <h2 className="text-xl font-black mb-2">Ready to book?</h2>
        <p className="text-amber-200 text-sm mb-6">
          Schedule online in minutes. We&apos;ll take it from there.
        </p>
        <Link
          href="/book"
          className="inline-block bg-white text-amber-700 hover:bg-amber-50 px-7 py-3 rounded-xl font-bold text-sm transition-colors"
        >
          Book Now
        </Link>
      </section>
    </main>
  );
}
