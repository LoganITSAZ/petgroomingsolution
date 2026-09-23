import { afterEach, describe, expect, it, vi } from "vitest";
import { businessJsonLd, faqJsonLd, postalAddress, publicMetadata, serializeJsonLd, serviceAreaName, serviceListJsonLd, siteUrl } from "./seo";

const shop = {
  shopName: "Gentle Groomer",
  shopWebsite: "https://grooming.test/",
  shopPhone: "602-555-0100",
  shopAddress: "456 Test Street, Phoenix, AZ 85001",
  businessHours: { monday: { open: "08:00", close: "17:00" }, sunday: null },
  shopCity: null,
  shopRegion: null,
  shopPostalCode: null,
  serviceAreaMiles: 20,
  seoKeywords: null,
};

afterEach(() => vi.unstubAllEnvs());

describe("search metadata", () => {
  it("uses the saved website instead of the authentication origin", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://auth.test");
    expect(siteUrl({ shopWebsite: " https://grooming.test/path?tracking=1 " })?.href).toBe("https://grooming.test/");
    expect(publicMetadata(shop, "/services").alternates?.canonical).toBe("https://grooming.test/services");
    expect(publicMetadata({ ...shop, shopWebsite: "https://new-shop.test" }, "/contact").alternates?.canonical).toBe("https://new-shop.test/contact");
  });

  it.each([null, "", "not a URL", "javascript:alert(1)", "ftp://grooming.test", "https://user:pass@grooming.test", "http://localhost:3000", "http://127.0.0.1", "https://your-domain.example", "https://example.com"])("does not publish a canonical for an unconfigured or preview site: %s", (shopWebsite) => {
    const config = { ...shop, shopWebsite };
    expect(siteUrl(config)).toBeUndefined();
    expect(publicMetadata(config, "/").alternates).toBeUndefined();
    expect(publicMetadata(config, "/").robots).toEqual({ index: false, follow: true });
  });

  it("gives each public page its own metadata without doubling the title template", () => {
    const pages = (["/", "/services", "/about", "/contact"] as const).map((path) => publicMetadata(shop, path));
    expect(new Set(pages.map((page) => page.title)).size).toBe(4);
    expect(new Set(pages.map((page) => page.description)).size).toBe(4);
    for (const page of pages) {
      expect(page.title).not.toContain(shop.shopName);
      expect(page.title).toContain("Phoenix, AZ");
      expect(page.description).toContain("within 20 miles of Phoenix, AZ");
      expect(page.openGraph).toMatchObject({ siteName: shop.shopName });
      expect(page.twitter).toMatchObject({ card: "summary_large_image" });
    }
  });

  it("follows the saved service radius and never advertises none", () => {
    expect(publicMetadata({ ...shop, serviceAreaMiles: 45 }, "/").description).toContain("within 45 miles");
    expect(publicMetadata({ ...shop, serviceAreaMiles: 0 }, "/").description).toContain("within 20 miles");
    expect(publicMetadata({ ...shop, serviceAreaMiles: -5 }, "/").description).toContain("within 1 mile");
  });

  it("falls back to the derived copy for every blank part of an override", () => {
    const derived = publicMetadata(shop, "/about");
    const page = publicMetadata(shop, "/about", { title: "  ", description: "Our groomers, and our promise.", keywords: null, photoId: null });
    expect(page.title).toBe(derived.title);
    expect(page.description).toBe("Our groomers, and our promise.");
    expect(page.openGraph?.title).toContain("Our Grooming Shop");
    expect(page.keywords).toBeUndefined();
  });

  it("shares an uploaded image for the page that has one, and the generated card otherwise", () => {
    const withUpload = publicMetadata(shop, "/", { title: null, description: null, keywords: null, photoId: "pic1" });
    expect(withUpload.openGraph?.images).toEqual([expect.objectContaining({ url: "https://grooming.test/api/photos/pic1" })]);
    expect(publicMetadata(shop, "/").openGraph?.images).toEqual([expect.objectContaining({ url: "https://grooming.test/social-image" })]);
  });

  it("reads keywords as a list, page over shop, and omits an empty one", () => {
    expect(publicMetadata({ ...shop, seoKeywords: "dog grooming, , cat grooming " }, "/").keywords).toEqual(["dog grooming", "cat grooming"]);
    expect(publicMetadata({ ...shop, seoKeywords: "shop words" }, "/", { title: null, description: null, keywords: "page words", photoId: null }).keywords).toEqual(["page words"]);
    expect(publicMetadata({ ...shop, seoKeywords: " , " }, "/").keywords).toBeUndefined();
  });
});

describe("the address in parts", () => {
  it("reads the city, state and postal code out of the line the shop typed", () => {
    expect(postalAddress(shop)).toEqual({ streetAddress: "456 Test Street", addressLocality: "Phoenix", addressRegion: "AZ", postalCode: "85001" });
    expect(postalAddress({ ...shop, shopAddress: "8911 N Central Ave #104, Phoenix, AZ" })).toMatchObject({ addressLocality: "Phoenix", addressRegion: "AZ", postalCode: null });
    expect(postalAddress({ ...shop, shopAddress: "12 High Street, Suite 3, Mesa, AZ 85201" })).toMatchObject({ streetAddress: "12 High Street, Suite 3", addressLocality: "Mesa" });
  });

  it("takes the city from the geocoder, which the address line may not separate", () => {
    // The real shape of a typed address: one comma, city inside the street line.
    const typed = { ...shop, shopAddress: "8911 N Central Ave #104 Phoenix, AZ 85020" };
    expect(postalAddress(typed)).toMatchObject({ addressLocality: null, streetAddress: "8911 N Central Ave #104 Phoenix" });
    expect(postalAddress(typed, { city: "Phoenix", region: "Arizona", postalCode: "85020" })).toMatchObject({
      streetAddress: "8911 N Central Ave #104",
      addressLocality: "Phoenix",
      // "AZ" as typed, not the lookup's "Arizona" — nobody searches for that.
      addressRegion: "AZ",
      postalCode: "85020",
    });
    expect(postalAddress({ ...shop, shopAddress: "The Old Dairy" }, { region: "Arizona", postalCode: "85020" })).toMatchObject({ addressRegion: "Arizona", postalCode: "85020" });
    expect(publicMetadata(typed, "/", null, { city: "Phoenix", region: "AZ" }).title).toContain("in Phoenix, AZ");
  });

  it("lets the saved fields correct a parse or a bad lookup", () => {
    expect(serviceAreaName(shop)).toBe("Phoenix, AZ");
    expect(serviceAreaName({ ...shop, shopCity: "Scottsdale" })).toBe("Scottsdale, AZ");
    expect(serviceAreaName(shop, { city: "Sunnyslope" })).toBe("Sunnyslope, AZ");
    expect(serviceAreaName({ ...shop, shopCity: "Phoenix" }, { city: "Sunnyslope" })).toBe("Phoenix, AZ");
  });

  it("is null without an address, and never invents a city", () => {
    expect(postalAddress({ ...shop, shopAddress: null })).toBeNull();
    expect(postalAddress({ ...shop, shopAddress: "   " })).toBeNull();
    const single = postalAddress({ ...shop, shopAddress: "The Old Dairy" });
    expect(single).toMatchObject({ streetAddress: "The Old Dairy", addressLocality: null });
    expect(publicMetadata({ ...shop, shopAddress: null }, "/").description).not.toContain("miles");
  });
});

describe("business structured data", () => {
  it("requires real saved location details and omits sample contact data", () => {
    expect(businessJsonLd({ ...shop, shopAddress: null })).toBeNull();
    expect(businessJsonLd({ ...shop, shopWebsite: null })).toBeNull();
    const data = businessJsonLd({ ...shop, shopPhone: null });
    expect(data).not.toHaveProperty("telephone");
    expect(data).not.toHaveProperty("aggregateRating");
    expect(data).toMatchObject({
      address: { "@type": "PostalAddress", streetAddress: "456 Test Street", addressLocality: "Phoenix", addressRegion: "AZ", postalCode: "85001" },
      openingHoursSpecification: [{ dayOfWeek: "https://schema.org/Monday", opens: "08:00", closes: "17:00" }],
    });
  });

  it("carries coordinates only when the geocoder found some", () => {
    expect(businessJsonLd(shop, { lat: 33.4, lon: -112.1 })).toMatchObject({ geo: { latitude: 33.4, longitude: -112.1 } });
    expect(businessJsonLd(shop, null)).not.toHaveProperty("geo");
    expect(businessJsonLd({ ...shop, serviceAreaMiles: 10 })).toMatchObject({ areaServed: { geoRadius: 16090 } });
  });

  it("ignores malformed hours", () => {
    expect(businessJsonLd({ ...shop, businessHours: { monday: { open: "25:00", close: "noon" } } })).not.toHaveProperty("openingHoursSpecification");
  });

  it("prevents shop text from ending the JSON-LD script element", () => {
    const value = { name: "</script><script>alert(1)</script>" };
    const serialized = serializeJsonLd(value);
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual(value);
  });
});

describe("catalog and question markup", () => {
  const service = { name: "Full Groom", description: "Bath, cut and finish.", priceFlatCents: null, priceSmallCents: 6500, priceMediumCents: 8000, priceLargeCents: 9500, priceXlCents: null };

  it("offers the lowest published tier, because it is the only one every pet qualifies for", () => {
    const data = serviceListJsonLd(shop, [service]) as { itemListElement: { item: { offers: { price: string }; provider: object } }[] };
    expect(data.itemListElement[0].item.offers.price).toBe("65.00");
    expect(data.itemListElement[0].item.provider).toEqual({ "@id": "https://grooming.test/#business" });
  });

  it("publishes a service with no price as a service, not a free one", () => {
    const free = serviceListJsonLd(shop, [{ ...service, priceSmallCents: null, priceMediumCents: null, priceLargeCents: null }]) as { itemListElement: { item: object }[] };
    expect(free.itemListElement[0].item).not.toHaveProperty("offers");
  });

  it("says nothing at all with no website or nothing to say", () => {
    expect(serviceListJsonLd(shop, [])).toBeNull();
    expect(serviceListJsonLd({ ...shop, shopWebsite: null }, [service])).toBeNull();
    expect(faqJsonLd(shop, [])).toBeNull();
    expect(faqJsonLd({ shopWebsite: null }, [{ question: "Cats?", answer: "Yes." }])).toBeNull();
    expect(faqJsonLd(shop, [{ question: "Cats?", answer: "Yes." }])).toMatchObject({ mainEntity: [{ name: "Cats?", acceptedAnswer: { text: "Yes." } }] });
  });
});
