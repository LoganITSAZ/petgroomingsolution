import type { Metadata } from "next";
import AddressMap from "@/components/AddressMap";
import { getConfig } from "@/lib/config";
import { summariseHours, type BusinessHours } from "@/lib/shop-hours";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const config = await getConfig();
  // Hours were typed into this page, so editing them in Shop Settings changed
  // every screen except the one headed "Contact Us". They come from the config
  // like everywhere else now.
  const week = summariseHours((config.businessHours as BusinessHours) ?? {});

  return (
    <div className="public-shell min-h-screen px-4 py-12">
      {/*
        One page, one panel. How to reach us and where we are were two glass
        cards side by side; they are halves of one panel now, divided by a
        hairline that becomes a horizontal rule when the columns stack.
      */}
      <div className="glass-panel mx-auto max-w-5xl overflow-hidden rounded-3xl">
      <header className="border-b border-line/70 p-7 text-center md:p-10">
        <p className="public-eyebrow mb-4">We&apos;re happy to help</p>
        <h1 className="public-section-title">Contact Us</h1>
      </header>
      <div className="grid md:grid-cols-2">
        <div className="space-y-6 border-b border-line/70 p-7 md:border-b-0 md:border-r">
          {config.shopPhone && (
            <div>
              <h2 className="text-sm tracking-tight text-muted/70 mb-1">Phone</h2>
              <a href={`tel:${config.shopPhone}`} className="text-xl font-semibold text-brand-text hover:underline">
                {config.shopPhone}
              </a>
            </div>
          )}
          {config.shopAddress && (
            <div>
              <h2 className="text-sm tracking-tight text-muted/70 mb-1">Address</h2>
              <p className="text-lg text-ink/80">{config.shopAddress}</p>
            </div>
          )}
          <div>
            <h2 className="text-sm tracking-tight text-muted/70 mb-2">Hours</h2>
            <ul className="space-y-1 text-ink/80">
              {week.map((line) => {
                const [label, text] = line.split(": ");
                return (
                  <li key={line}>
                    <span className="font-medium">{label}</span> · {text}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <div className="flex min-h-[28rem] items-center justify-center p-7 text-center md:p-10">
          <h2 className="sr-only">Where to find us</h2>
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
                <p className="text-4xl mb-3" aria-hidden="true">📍</p>
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
