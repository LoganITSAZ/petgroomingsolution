# Search setup

Almost nothing here is typed twice. In **Admin → Shop Settings**, set **Live website URL** to this site's public HTTPS origin and fill in the shop name, address (including the city), phone and opening hours. Everything a search engine is told is then derived from those: the page titles carry the city, the descriptions carry the service radius, the business markup carries the address in parts and the hours, the offers carry the live catalog prices, and the social card carries the shop name, its tagline and the live theme. Changes apply at request time without rebuilding. A blank, invalid, localhost, or example-domain website keeps public pages marked noindex and the sitemap empty until configured.

**Admin → Marketing** holds the knobs that cannot be derived, under *Search & sharing*:

- **Service area (miles)** — the radius the public copy and the `GeoCircle` state. Floored at one mile.
- **Social card tagline** — the line under the shop name on the shared image. Blank uses the site tagline.
- **Google Search Console token** — the `content` value from the HTML-tag verification method, for a domain that cannot be verified by DNS.
- **Keywords** — comma separated. No major search engine ranks on this tag; it is there because it was asked for.

*Page titles & descriptions* holds an override per public page, with the derived line shown as the placeholder — a blank field is the derived line, not an empty tag, and a page with nothing set has no row in `seo_pages` at all. A page may also carry its own share image (2 MB, JPEG/PNG/WebP, stored like any other photo); with none, the generated 1200×630 card is used.

*Frequently asked questions* is the shop's own answers. Active questions render on `/services` as native `<details>` rows and publish as `FAQPage` markup; with none, neither appears.

The city, state and ZIP are read out of the address line the shop already typed — the last two comma-separated segments, which is the shape of every address it will write. `shopCity` / `shopRegion` / `shopPostalCode` in Shop Settings, under *Correct the city, state and ZIP*, exist only for an address that does not parse. Coordinates come from the same cached Nominatim lookup the maps use, so `geo` costs no extra configuration and no extra request.

Account and workspace pages inherit noindex metadata, with an additional HTTP noindex directive on their responses and redirects. Authentication remains the access control. Robots permits crawlers to read noindex directives and excludes API routes; the sitemap contains only public marketing pages and takes its `lastModified` from the config row. Business JSON-LD uses saved contact details and hours, never the contact preview fallbacks or self-serving review ratings. Service offers publish the **lowest** published tier, because that is the only price every pet qualifies for, and are list prices rather than tickets.

After deployment:

1. Check `/robots.txt`, `/sitemap.xml`, `/icon` and the canonical links against the public domain.
2. Verify the domain in Google Search Console and submit `/sitemap.xml`; inspect the home and services URLs.
3. Validate the home and services pages with Schema.org's validator and Google's Rich Results Test. Basic business markup does not guarantee a rich result.
4. Keep Google Business Profile's website, address, phone, services, and opening hours consistent with the site. Search Console and Business Profile setup require their respective accounts.
5. Measure mobile Core Web Vitals with PageSpeed Insights and monitor real search queries after indexing. A service-radius statement describes the intended audience; it does not restrict organic rankings to that radius.

References: [Google local business guidance](https://developers.google.com/search/docs/appearance/structured-data/local-business), [Next.js metadata](https://nextjs.org/docs/app/getting-started/metadata-and-og-images).
