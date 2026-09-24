"use client";

import { useMemo, useState, type ReactNode } from "react";
import styles from "./ServicePricingExplorer.module.css";
import { PET_SIZES, sizeName, sizeRange, type PetSize, type SizeCutoffs } from "@/lib/pet-size";

type PetType = "DOG" | "CAT";
type DogSize = "priceSmallCents" | "priceMediumCents" | "priceLargeCents" | "priceXlCents";

export interface PricingService {
  id: string;
  name: string;
  description: string | null;
  category: string;
  species: string | null;
  priceSmallCents: number | null;
  priceMediumCents: number | null;
  priceLargeCents: number | null;
  priceXlCents: number | null;
  priceFlatCents: number | null;
  priceMaxCents: number | null;
  durationMins: number | null;
  walkInEligible: boolean;
  offers: { title: string; code: string | null }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  GROOM: "Grooming",
  BATH: "Bathing & care",
  NAILS: "Nails & paws",
  DENTAL: "Teeth & ears",
  EARS: "Teeth & ears",
  ADD_ON: "Add-ons",
  OTHER: "More care",
};

const SIZE_FIELD: Record<PetSize, DogSize> = {
  SMALL: "priceSmallCents",
  MEDIUM: "priceMediumCents",
  LARGE: "priceLargeCents",
  XL: "priceXlCents",
};
const SIZE_FIELDS = Object.values(SIZE_FIELD);

function money(cents: number | null): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function priceLabel(service: PricingService): string {
  const prices = [
    service.priceSmallCents,
    service.priceMediumCents,
    service.priceLargeCents,
    service.priceXlCents,
    service.priceFlatCents,
    service.priceMaxCents,
  ].filter((value): value is number => value != null);

  if (prices.length === 0) return "Price on request";
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? money(low) : `${money(low)}–${money(high)}`;
}

export default function ServicePricingExplorer({ services, extras, cutoffs }: { services: PricingService[]; extras?: ReactNode; cutoffs: SizeCutoffs }) {
  const [petType, setPetType] = useState<PetType>("DOG");
  const [dogSize, setDogSize] = useState<DogSize | null>(null);
  const [category, setCategory] = useState("All care");
  const matching = useMemo(() => services.filter((service) => service.species === petType || service.species === null), [petType, services]);
  const grouped = useMemo(() => {
    const result = new Map<string, PricingService[]>();
    for (const service of matching) {
      const label = CATEGORY_LABELS[service.category] ?? "More care";
      result.set(label, [...(result.get(label) ?? []), service]);
    }
    return result;
  }, [matching]);
  const dogSizes = PET_SIZES.map((size) => ({ value: SIZE_FIELD[size], label: sizeName(size), detail: sizeRange(size, cutoffs) }));
  const selectedSize = dogSizes.find((size) => size.value === dogSize);
  const visibleGroups = Array.from(grouped).filter(([label]) => category === "All care" || label === category);
  const count = visibleGroups.reduce((total, [, items]) => total + items.length, 0);

  return (
    <section aria-labelledby="pricing-tool-heading" className={styles.explorer}>
      <div className={styles.preferences}>
        <p className="public-eyebrow">Personalize the menu</p>
        <h2 id="pricing-tool-heading" className={styles.title}>Find their care.</h2>
        <p className={styles.intro}>Choose your companion and size to see their prices.</p>
        <fieldset className={styles.fieldset}>
          <legend>Your companion</legend>
          <div className={styles.petToggle}>
            {(["DOG", "CAT"] as const).map((type) => (
              <button key={type} type="button" aria-pressed={petType === type} onClick={() => { setPetType(type); setCategory("All care"); }}>
                {type === "DOG" ? "Dog" : "Cat"}
              </button>
            ))}
          </div>
        </fieldset>
        {petType === "DOG" && (
          <fieldset className={styles.fieldset}>
            <legend>Dog size</legend>
            <div className={styles.sizes}>
              <button type="button" aria-pressed={dogSize === null} onClick={() => setDogSize(null)}><span>All sizes</span><span>Compare prices</span></button>
              {dogSizes.map((size) => (
                <button key={size.value} type="button" aria-pressed={dogSize === size.value} onClick={() => setDogSize(size.value)}><span>{size.label}</span><span>{size.detail}</span></button>
              ))}
            </div>
            <p className={styles.hint}>Between weight ranges? Ask us to confirm the right size for your dog.</p>
          </fieldset>
        )}
        <div className={styles.note}><span aria-hidden="true">✧</span><p>Every coat is different.<br /><span>Prices are a guide. Your pet’s coat and care needs may affect the final price.</span></p></div>
      </div>
      <div className={styles.menu}>
        <div className={styles.menuHeading}>
          <div><p className="public-eyebrow">The care menu</p><h3>{petType === "DOG" ? selectedSize ? `${selectedSize.label} dog` : "All dog sizes" : "Cat care"}</h3></div>
          <p role="status"><span className="sr-only">{petType === "DOG" ? selectedSize ? `${selectedSize.label} dog: ` : "All dog sizes: " : "Cat care: "}</span>{count} {count === 1 ? "service" : "services"}</p>
        </div>
        <div className={styles.filters} role="group" aria-label="Filter by care category">
          {["All care", ...grouped.keys()].map((label) => <button type="button" key={label} aria-pressed={category === label} onClick={() => setCategory(label)}>{label}</button>)}
        </div>
        {visibleGroups.length === 0 && <p className={styles.empty}>No services are currently listed for your pet. Contact the shop and we’ll help you find the right care.</p>}
        {visibleGroups.map(([label, items]) => (
          <section key={label} className={styles.category} aria-label={label}>
            <h4>{label}<span>{items.length} {items.length === 1 ? "service" : "services"}</span></h4>
            {items.map((service) => {
              const sized = petType === "DOG" && SIZE_FIELDS.some((field) => service[field] != null);
              const price = sized && dogSize ? service[dogSize] == null ? "Price on request" : money(service[dogSize]) : priceLabel(service);
              return (
                <article key={service.id} className={styles.service}>
                  <div className={styles.serviceInfo}>
                    <h5>{service.name}</h5>
                    {service.description && <p>{service.description}</p>}
                    <div className={styles.meta}>
                      {service.durationMins != null && service.durationMins > 0 && <span>{service.durationMins} min</span>}
                      {service.walkInEligible && <span className={styles.walkIn}>Walk-ins welcome</span>}
                      {service.offers.map((offer) => <span className={styles.offer} key={`${offer.title}-${offer.code ?? ""}`}>{offer.title}{offer.code ? ` · ${offer.code}` : ""}</span>)}
                    </div>
                  </div>
                  <div className={styles.price}><span>{price}</span>{sized && <small>{selectedSize ? `${selectedSize.label} dog` : "Varies by size"}</small>}</div>
                </article>
              );
            })}
          </section>
        ))}
        {extras}
      </div>
    </section>
  );
}
