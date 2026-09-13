import type { Metadata } from "next";
import ServicePricingExplorer from "@/components/ServicePricingExplorer";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { livePromotions } from "@/lib/promotions";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Services & Pricing" };

// Prices and promotions are edited in the admin panel at runtime; a static
// snapshot would freeze them until the next deploy.
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const [config, services, surcharges, promotions] = await Promise.all([
    getConfig(),
    prisma.service.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.surcharge.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    livePromotions("site"),
  ]);

  const offersByService = new Map<string, { title: string; code: string | null }[]>();
  for (const promotion of promotions) {
    offersByService.set(promotion.serviceId, [
      ...(offersByService.get(promotion.serviceId) ?? []),
      { title: promotion.title, code: promotion.code },
    ]);
  }

  const serviceOptions = services
    .filter((service) => service.species === "DOG" || service.species === "CAT" || service.species === null)
    .map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      category: service.category,
      species: service.species,
      priceSmallCents: service.priceSmallCents,
      priceMediumCents: service.priceMediumCents,
      priceLargeCents: service.priceLargeCents,
      priceXlCents: service.priceXlCents,
      priceFlatCents: service.priceFlatCents,
      priceMaxCents: service.priceMaxCents,
      durationMins: service.durationMins,
      walkInEligible: service.walkInEligible,
      offers: offersByService.get(service.id) ?? [],
    }));

  return (
    <div className="public-shell min-h-screen px-4 py-12">
      {/*
        One page, one panel. The heading, the pricing tool and the fee notes
        were three glass cards floating apart; they are bands of a single panel
        now, divided by a hairline, so the page reads as one thing.
      */}
      <div className="glass-panel mx-auto max-w-5xl overflow-hidden rounded-3xl">
        <header className="border-b border-line/70 p-7 md:p-10">
          <p className="public-eyebrow mb-4">Made for every coat &amp; character</p>
          <h1 className="public-section-title mb-2">Services &amp; Pricing</h1>
          <p className="max-w-2xl text-muted">
            Start with your pet type and we&apos;ll narrow the menu to the care that fits them best.
          </p>
        </header>

        {serviceOptions.length === 0 ? (
          <div className="p-7 text-muted">
            Pricing is being updated. Call {config.shopPhone ?? "the shop"} for a quote.
          </div>
        ) : (
          <>
          {/* The explorer's own steps are labelled groups, but the band itself
              had nothing under the <h1> to navigate to. */}
          <h2 className="sr-only">Pricing for your pet</h2>
          <ServicePricingExplorer
            services={serviceOptions}
            extras={
              surcharges.length > 0 ? (
                <details className="disclosure mt-5 rounded-2xl border border-well-line bg-well/70 px-5 py-4">
                  <summary className="font-bold text-ink">Additional fees &amp; care notes</summary>
                  <p className="mt-2 text-sm text-muted">Some pets need extra time or specialized care. We&apos;ll always discuss this with you first.</p>
                  <ul className="mt-4 space-y-2">
                    {surcharges.map((surcharge) => (
                      <li key={surcharge.id} className="flex justify-between gap-4 rounded-xl bg-well/85 px-3 py-2 text-sm">
                        <span className="text-ink/80">
                          {surcharge.label}
                          {surcharge.note && <span className="block text-xs text-muted">{surcharge.note}</span>}
                        </span>
                        <span className="shrink-0 font-semibold text-ink">
                          {surcharge.minCents != null && surcharge.maxCents != null
                            ? `${formatCents(surcharge.minCents)}–${formatCents(surcharge.maxCents)}`
                            : formatCents(surcharge.minCents ?? surcharge.maxCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null
            }
          />
          </>
        )}

      </div>
    </div>
  );
}
