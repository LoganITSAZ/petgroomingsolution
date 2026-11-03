import { publicMetadata } from "@/lib/seo";
import { seoOverride } from "@/lib/seo-pages";
import { geocode } from "@/lib/maps";
import { getConfig } from "@/lib/config";
import OfficeIcon from "@/components/OfficeIcon";
import AddressMap from "@/components/AddressMap";
import Link from "next/link";
import styles from "./about.module.css";

export async function generateMetadata() {
  const config = await getConfig();
  // The city in the title comes from the same cached lookup the maps use.
  return publicMetadata(config, "/about", await seoOverride("/about"), await geocode(config.shopAddress));
}

export default async function AboutPage() {
  const config = await getConfig();
  const shopName = config.shopName ?? "Gentle Groomer";

  return (
    <div className={styles.page}>
      <article className={styles.panel}>
        <div className={styles.body}>
          <h1 className={styles.title}>About {shopName}</h1>
          <p className={styles.lead}>
            {shopName} was founded on a simple belief: every pet deserves to be groomed by
            someone who genuinely loves animals. We started as a single-table operation and
            grew into a neighborhood studio — the approach never changed.
          </p>
          <p>
            We don&apos;t rush your pet through the process. From the first brush stroke to the
            final spritz, we pay attention to how your pet is feeling and adjust as we go. A dog
            who needs a break gets one, and a cat who has had enough of the dryer tells us so.
          </p>
          <p>
            Our groomers are experienced and committed to continuing education, so your pet gets
            the benefit of current techniques — and we tell you plainly what we found and what we
            did, every visit.
          </p>
        </div>

        {/* No address typed, no section — the map is never a placeholder. */}
        {config.shopAddress ? (
          <section className={styles.place}>
            <div className={styles.placeCopy}>
              <h2>Where to find us.</h2>
              <address>{config.shopAddress}</address>
            </div>
            <AddressMap address={config.shopAddress} title={`Map showing ${shopName}`} height={200} className={styles.map} />
          </section>
        ) : null}

        <div className={styles.cta}>
          <div className={styles.ctaPaw} aria-hidden="true"><OfficeIcon name="paw" /></div>
          <div>
            <h2>See what a visit includes.</h2>
            <p className={styles.ctaNote}>
              Grooming, bathing and add-on services, with current pricing.
            </p>
          </div>
          <Link href="/services" className={styles.ctaLink}>View our services</Link>
        </div>
      </article>
    </div>
  );
}
