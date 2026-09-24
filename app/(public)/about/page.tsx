import { publicMetadata } from "@/lib/seo";
import { seoOverride } from "@/lib/seo-pages";
import { geocode } from "@/lib/maps";
import { getConfig } from "@/lib/config";
import OfficeIcon from "@/components/OfficeIcon";
import Link from "next/link";
import styles from "./about.module.css";

export async function generateMetadata() {
  const config = await getConfig();
  // The city in the title comes from the same cached lookup the maps use.
  return publicMetadata(config, "/about", await seoOverride("/about"), await geocode(config.shopAddress));
}

const CLAIMS: [string, string][] = [
  ["A gentler pace", "No pet is rushed through. We work to the animal in front of us."],
  ["Experienced hands", "Groomers who keep learning, on every coat and every temperament."],
  ["Comfort first", "Nervous, elderly and first-time pets get the same patient handling."],
];

export default async function AboutPage() {
  const config = await getConfig();
  const shopName = config.shopName ?? "Gentle Groomer";

  return (
    <div className="public-shell min-h-screen">
      <div className={styles.page}>
        <article className={styles.panel}>
          {/* Heading and story share a baseline rather than stacking apart. */}
          <header className={styles.masthead}>
            <div>
              <h1 className={styles.title}>We take our time.</h1>
              <span className={styles.shop}>About {shopName}</span>
            </div>
            <p className={styles.opening}>
              {shopName} was founded on a simple belief: every pet deserves to be groomed by
              someone who genuinely loves animals. We started as a single-table operation and
              grew into a neighborhood studio — the approach never changed.
            </p>
          </header>

          <div className={styles.story}>
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

          <dl className={styles.claims}>
            {CLAIMS.map(([claim, detail]) => (
              <div key={claim} className={styles.claim}>
                <dt>{claim}</dt>
                <dd>{detail}</dd>
              </div>
            ))}
          </dl>

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
    </div>
  );
}
