import Link from "next/link";
import { getConfig } from "@/lib/config";

// SystemConfig is edited at runtime from /admin, so these pages must not be
// baked at build time — a prerendered snapshot would freeze shop details,
// feature flags, and waiver text until the next deploy.
export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const config = await getConfig();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl text-brand-700">
            🐾 {config.shopName}
          </Link>
          <nav className="flex items-center gap-6 text-stone-600">
            <Link href="/about" className="hover:text-brand-600 transition-colors">About</Link>
            <Link href="/services" className="hover:text-brand-600 transition-colors">Services</Link>
            <Link href="/contact" className="hover:text-brand-600 transition-colors">Contact</Link>
            {config.featureOnlineBooking && (
              <Link
                href="/portal"
                className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                Book Now
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-stone-800 text-stone-300 py-10">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <p className="font-bold text-white text-lg mb-2">🐾 {config.shopName}</p>
            <p className="italic text-stone-400">Patience, Love & Kindness</p>
          </div>
          <div>
            <p className="font-semibold text-white mb-2">Hours</p>
            <p>Mon: 8am – 3pm</p>
            <p>Tue – Sat: 8am – 5pm</p>
            <p>Sun: Closed</p>
          </div>
          <div>
            <p className="font-semibold text-white mb-2">Contact</p>
            {config.shopPhone && <p>{config.shopPhone}</p>}
            {config.shopAddress && <p>{config.shopAddress}</p>}
          </div>
        </div>
      </footer>
    </div>
  );
}
