import { faqJsonLd, publicMetadata, serializeJsonLd, serviceListJsonLd } from "@/lib/seo";
import { activeFaq, seoOverride } from "@/lib/seo-pages";
import { geocode } from "@/lib/maps";
import { headers } from "next/headers";
import Link from "next/link";
import styles from "@/components/ServicePricingExplorer.module.css";
import ServicePricingExplorer from "@/components/ServicePricingExplorer";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { livePromotions } from "@/lib/promotions";
import { getConfig } from "@/lib/config";
import { sizeCutoffs } from "@/lib/pet-size";

export async function generateMetadata() {
  const config = await getConfig();
  // The city in the title comes from the same cached lookup the maps use.
  return publicMetadata(config, "/services", await seoOverride("/services"), await geocode(config.shopAddress));
}

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
  const [faq, nonce] = await Promise.all([activeFaq(), headers().then((h) => h.get("x-nonce") ?? undefined)]);

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

  // The catalog and the shop's own answers, published as structured data. Both
  // are built from rows already on the page -- nothing is typed twice.
  const catalog = serviceListJsonLd(config, services);
  const questions = faqJsonLd(config, faq);

  return (
    <div className={styles.page}>
      {catalog && <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(catalog) }} />}
      {questions && <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(questions) }} />}
      <header className={styles.hero}>
        <div>
          <p className="public-eyebrow">Pet grooming services &amp; pricing</p>
          <h1>Care for every coat.<br /><span>And every character.</span></h1>
          <p>From a little tidy-up to a full groom. Explore thoughtful care and clear pricing, tailored to your pet.</p>
        </div>
      </header>
      <div className={styles.panel}>
        {serviceOptions.length === 0 ? (
          <div className="p-7 text-muted">
            Pricing is being updated. Call {config.shopPhone ?? "the shop"} for a quote.
          </div>
        ) : (
          <>
          <ServicePricingExplorer
            services={serviceOptions}
            cutoffs={sizeCutoffs(config)}
            extras={
              surcharges.length > 0 ? (
                <details className={`disclosure ${styles.fees}`}>
                  <summary className="font-semibold text-ink">Additional fees &amp; care notes</summary>
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
      {serviceOptions.length > 0 && (
        <section className="mx-auto mt-8 max-w-6xl px-4" aria-labelledby="all-services-heading">
          <h2 id="all-services-heading" className="public-section-title">Explore all grooming services</h2>
          <p className="mt-3 text-muted">Browse every service, or use the menu above to compare pricing for your pet.</p>
          <div className="mt-5 divide-y divide-line">
            {serviceOptions.map((service) => (
              <details key={service.id} className="py-4">
                <summary className="cursor-pointer font-semibold text-ink">{service.name} · {service.species === "DOG" ? "Dogs" : service.species === "CAT" ? "Cats" : "Dogs & cats"}</summary>
                <p className="mt-2 text-muted">{service.description || "Contact us to discuss this service and your pet’s care needs."}</p>
              </details>
            ))}
          </div>
        </section>
      )}
      {faq.length > 0 && (
        <section className="mx-auto mt-8 max-w-6xl px-4" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="public-section-title">Frequently asked questions</h2>
          <div className="mt-5 divide-y divide-line">
            {faq.map((item) => (
              <details key={item.id} className="disclosure py-4">
                <summary className="cursor-pointer font-semibold text-ink">{item.question}</summary>
                <p className="mt-2 whitespace-pre-line text-muted">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}
      <section className={styles.help} aria-labelledby="care-help-heading">
        <div>
          <h2 id="care-help-heading">Not sure what your pet needs?</h2>
          <p>Tell us a little about your companion. We’ll help you choose the right care.</p>
        </div>
        <Link href="/contact">Let’s talk about your pet <span aria-hidden="true">↗</span></Link>
      </section>
    </div>
  );
}
