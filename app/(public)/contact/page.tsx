import type { Metadata } from "next";
import AddressMap from "@/components/AddressMap";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const config = await getConfig();

  return (
    <div className="public-shell min-h-screen px-4 py-12">
      <div className="mx-auto max-w-5xl">
      <header className="mb-8 text-center">
        <p className="public-eyebrow mb-4">We&apos;re happy to help</p>
        <h1 className="public-section-title">Contact Us</h1>
      </header>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="glass-panel rounded-3xl p-7 space-y-6">
          {config.shopPhone && (
            <div>
              <p className="text-sm uppercase tracking-widest text-muted/70 mb-1">Phone</p>
              <a href={`tel:${config.shopPhone}`} className="text-xl font-semibold text-brand-text hover:underline">
                {config.shopPhone}
              </a>
            </div>
          )}
          {config.shopAddress && (
            <div>
              <p className="text-sm uppercase tracking-widest text-muted/70 mb-1">Address</p>
              <p className="text-lg text-ink/80">{config.shopAddress}</p>
            </div>
          )}
          <div>
            <p className="text-sm uppercase tracking-widest text-muted/70 mb-2">Hours</p>
            <div className="space-y-1 text-ink/80">
              <p><span className="font-medium">Monday</span> · 8:00 am – 3:00 pm</p>
              <p><span className="font-medium">Tuesday – Saturday</span> · 8:00 am – 5:00 pm</p>
              <p><span className="font-medium">Sunday</span> · Closed</p>
            </div>
          </div>
        </div>
        <div className="glass-panel flex min-h-[28rem] items-center justify-center rounded-3xl p-7 text-center md:p-10">
          <div className="w-full">
            {config.shopAddress ? (
              /* Driven by the address in Shop Settings, not a hardcoded one. */
              <AddressMap
                address={config.shopAddress}
                title={`Map showing ${config.shopName}`}
                height={420}
                edgeToEdge
              />
            ) : (
              <>
                <p className="text-4xl mb-3">📍</p>
                <p className="text-muted">Add a shop address in Shop Settings to show a map here.</p>
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
