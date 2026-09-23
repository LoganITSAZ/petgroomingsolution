import type { Metadata } from "next";
import type { SeoPage, SystemConfig } from "@prisma/client";

/**
 * What the shop tells search engines, derived from what it has already typed.
 *
 * Nothing here is a second copy of a shop fact: the titles are written from
 * `shopName`, the service area from one number, the address from the address,
 * the hours from the business hours, the offers from the live catalog. The
 * overrides in `SeoPage` exist only so a shop that wants its own words can
 * have them — a blank column is the derived line, not an empty tag.
 */

export const PUBLIC_PATHS = ["/", "/services", "/about", "/contact"] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];

export const PAGE_LABELS: Record<PublicPath, string> = {
  "/": "Home",
  "/services": "Services & pricing",
  "/about": "About",
  "/contact": "Contact",
};

type Shop = Pick<
  SystemConfig,
  | "shopName"
  | "shopPhone"
  | "shopAddress"
  | "shopWebsite"
  | "businessHours"
  | "shopCity"
  | "shopRegion"
  | "shopPostalCode"
  | "serviceAreaMiles"
  | "seoKeywords"
>;

type Override = Pick<SeoPage, "title" | "description" | "keywords" | "photoId"> | null | undefined;

/**
 * What the geocoder resolved for the shop's address — see lib/maps.ts. The map
 * knows the city, so nothing here has to guess at one.
 */
export type Place = { lat?: number; lon?: number; city?: string | null; region?: string | null; postalCode?: string | null } | null | undefined;

/** The saved shop website owns canonicals, sharing, and crawler discovery. */
export function siteUrl(config: Pick<SystemConfig, "shopWebsite">): URL | undefined {
  const value = config.shopWebsite?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;
    if (url.hostname === "localhost" || url.hostname === "[::1]" || /^127\./.test(url.hostname) || url.hostname.endsWith(".local") || url.hostname.endsWith(".example") || /(^|\.)example\.(com|org|net)$/.test(url.hostname)) return undefined;
    return new URL(url.origin);
  } catch {
    return undefined;
  }
}

/** How far out the copy says the shop serves. Floored at one mile. */
export function serviceAreaMiles(config: Pick<Shop, "serviceAreaMiles">): number {
  return Math.max(1, Math.round(config.serviceAreaMiles || 20));
}

/**
 * The address in the parts a search engine wants.
 *
 * The shop types its address once, as one line, the way it says it — and that
 * line does not reliably separate the city: "8911 N Central Ave #104 Phoenix,
 * AZ 85020" has one comma in it. So the city comes from the geocoder, which
 * already looked the building up for the map, and the columns on
 * `SystemConfig` are only the correction for a place it got wrong.
 */
export function postalAddress(
  config: Pick<Shop, "shopAddress" | "shopCity" | "shopRegion" | "shopPostalCode">,
  place?: Place
) {
  const line = config.shopAddress?.trim().replace(/\s+/g, " ") ?? "";
  const parts = line.split(",").map((part) => part.trim()).filter(Boolean);

  // "AZ 85001", "AZ", "85001" — a trailing region and/or postal code.
  const tail = parts.length > 1 ? parts[parts.length - 1] : "";
  const match = /^([A-Za-z][A-Za-z. ]*?)?\s*(\d{5}(?:-\d{4})?)?$/.exec(tail);
  const parsedRegion = match?.[1]?.trim() || null;
  const parsedPostal = match?.[2] || null;
  const consumedTail = Boolean(parsedRegion || parsedPostal);

  const cityIndex = consumedTail ? parts.length - 2 : parts.length - 1;
  const parsedCity = parts.length > 1 && cityIndex > 0 ? parts[cityIndex] : null;
  const streetEnd = parsedCity ? cityIndex : consumedTail ? parts.length - 1 : parts.length;

  /*
   * The city comes from the map, because the line rarely separates it. The
   * state and postal code go the other way round: the shop writes "AZ", and
   * "Pet Grooming in Phoenix, Arizona" is not how anybody searches. So the
   * typed line wins for those two, and the lookup is the fallback.
   */
  const addressLocality = config.shopCity?.trim() || place?.city?.trim() || parsedCity;
  const addressRegion = config.shopRegion?.trim() || parsedRegion || place?.region?.trim() || null;
  const postalCode = config.shopPostalCode?.trim() || parsedPostal || place?.postalCode?.trim() || null;

  let streetAddress = parts.slice(0, Math.max(1, streetEnd)).join(", ") || null;
  // A city written into the street line without a comma is still the city, and
  // repeating it in streetAddress would have the shop on a road named after it.
  if (streetAddress && addressLocality) {
    const trimmed = streetAddress.replace(new RegExp(`[\\s,]+${escapeRegExp(addressLocality)}$`, "i"), "").trim();
    if (trimmed) streetAddress = trimmed;
  }

  if (!streetAddress) return null;
  return { streetAddress, addressLocality, addressRegion, postalCode };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "Phoenix, AZ" — the place name the public copy and titles use. */
export function serviceAreaName(
  config: Pick<Shop, "shopAddress" | "shopCity" | "shopRegion" | "shopPostalCode">,
  place?: Place
): string | null {
  const address = postalAddress(config, place);
  if (!address) return null;
  const name = [address.addressLocality, address.addressRegion].filter(Boolean).join(", ");
  return name || address.streetAddress;
}

export function publicMetadata(config: Shop, path: PublicPath, override?: Override, geo?: Place): Metadata {
  const name = config.shopName.trim();
  const place = serviceAreaName(config, geo);
  const pages = {
    "/": ["Pet Grooming", `Patient, gentle pet grooming at ${name}. Explore services and pricing, check opening hours, and plan your pet's next visit.`],
    "/services": ["Pet Grooming Services & Pricing", `Explore pet grooming services and current pricing at ${name}. Compare care options for your pet and contact us for help choosing a service.`],
    "/about": ["About Our Grooming Shop", `Meet ${name} and learn about our patient approach to pet grooming, with comfort and gentle handling at the heart of every visit.`],
    "/contact": ["Contact & Opening Hours", `Contact ${name} about your pet's grooming needs. Find our opening hours, location, and phone number to plan your visit.`],
  } as const;
  const [derivedTitle, summary] = pages[path];

  // The city is the thing a local search is actually about, so the derived
  // title carries it when the shop's address gives us one.
  const title = override?.title?.trim() || (place ? `${derivedTitle} in ${place}` : derivedTitle);
  const derivedDescription = place
    ? `${summary} Serving pet owners within ${serviceAreaMiles(config)} miles of ${place}.`
    : summary;
  const description = override?.description?.trim() || derivedDescription;
  const keywords = (override?.keywords?.trim() || config.seoKeywords?.trim() || "")
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);

  const base = siteUrl(config);
  const url = base ? new URL(path, base).href : undefined;
  const share = override?.photoId ? `/api/photos/${override.photoId}` : "/social-image";
  const images = base ? [{ url: new URL(share, base).href, width: 1200, height: 630, alt: `${name} — Pet grooming` }] : undefined;
  return {
    title,
    description,
    keywords: keywords.length ? keywords : undefined,
    alternates: url ? { canonical: url } : undefined,
    robots: { index: Boolean(base), follow: true },
    openGraph: { type: "website", locale: "en_US", siteName: name, title: `${title} | ${name}`, description, url, images },
    twitter: { card: "summary_large_image", title: `${title} | ${name}`, description, images },
  };
}

/** Only saved, visible shop facts; never preview contact details or review stars. */
export function businessJsonLd(config: Shop, geo?: Place) {
  const base = siteUrl(config);
  const address = postalAddress(config, geo);
  if (!base || !config.shopName.trim() || !address) return null;
  const hours = config.businessHours;
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const openingHoursSpecification = days.flatMap((day) => {
    const value = hours && typeof hours === "object" && !Array.isArray(hours) ? hours[day.toLowerCase()] : null;
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const { open, close } = value;
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (typeof open !== "string" || typeof close !== "string" || !time.test(open) || !time.test(close)) return [];
    return [{ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${day}`, opens: open, closes: close }];
  });
  const place = serviceAreaName(config, geo);
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": new URL("/#business", base).href,
    name: config.shopName.trim(),
    url: base.href,
    image: new URL("/social-image", base).href,
    address: {
      "@type": "PostalAddress",
      streetAddress: address.streetAddress,
      ...(address.addressLocality ? { addressLocality: address.addressLocality } : {}),
      ...(address.addressRegion ? { addressRegion: address.addressRegion } : {}),
      ...(address.postalCode ? { postalCode: address.postalCode } : {}),
    },
    ...(geo?.lat != null && geo.lon != null ? { geo: { "@type": "GeoCoordinates", latitude: geo.lat, longitude: geo.lon } } : {}),
    areaServed: {
      "@type": "GeoCircle",
      geoMidpoint: geo?.lat != null && geo.lon != null
        ? { "@type": "GeoCoordinates", latitude: geo.lat, longitude: geo.lon }
        : { "@type": "Place", address: place ?? address.streetAddress },
      geoRadius: serviceAreaMiles(config) * 1609,
    },
    ...(config.shopPhone?.trim() ? { telephone: config.shopPhone.trim() } : {}),
    ...(openingHoursSpecification.length ? { openingHoursSpecification } : {}),
  };
}

type CatalogService = {
  name: string;
  description: string | null;
  priceFlatCents: number | null;
  priceSmallCents: number | null;
  priceMediumCents: number | null;
  priceLargeCents: number | null;
  priceXlCents: number | null;
};

/**
 * The catalog as `Service` offers. Prices are the shop's own published list
 * prices — the same figures already printed on /services — and the lowest tier
 * is what goes out, because that is the only one every pet qualifies for.
 */
export function serviceListJsonLd(config: Shop, services: CatalogService[]) {
  const base = siteUrl(config);
  if (!base || services.length === 0) return null;
  const business = { "@id": new URL("/#business", base).href };
  const items = services.map((service, index) => {
    const prices = [service.priceFlatCents, service.priceSmallCents, service.priceMediumCents, service.priceLargeCents, service.priceXlCents].filter(
      (cents): cents is number => typeof cents === "number" && cents > 0
    );
    const from = prices.length ? Math.min(...prices) : null;
    return {
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Service",
        name: service.name,
        ...(service.description?.trim() ? { description: service.description.trim() } : {}),
        serviceType: "Pet grooming",
        provider: business,
        ...(from
          ? {
              offers: {
                "@type": "Offer",
                priceCurrency: "USD",
                price: (from / 100).toFixed(2),
                priceSpecification: {
                  "@type": "PriceSpecification",
                  priceCurrency: "USD",
                  minPrice: (from / 100).toFixed(2),
                  valueAddedTaxIncluded: false,
                },
                availability: "https://schema.org/InStock",
              },
            }
          : {}),
      },
    };
  });
  return { "@context": "https://schema.org", "@type": "ItemList", name: `Pet grooming services at ${config.shopName.trim()}`, itemListElement: items };
}

/** Questions the shop is actually asked, as FAQPage markup. */
export function faqJsonLd(config: Pick<Shop, "shopWebsite">, items: { question: string; answer: string }[]) {
  if (!siteUrl(config) || items.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
