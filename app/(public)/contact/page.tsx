import { publicMetadata } from "@/lib/seo";
import { seoOverride } from "@/lib/seo-pages";
import { geocode } from "@/lib/maps";
import Link from "next/link";
import ContactForm from "@/components/ContactForm";
import AddressMap from "@/components/AddressMap";
import PublicVisitCard from "@/components/PublicVisitCard";
import OfficeIcon from "@/components/OfficeIcon";
import { getConfig } from "@/lib/config";
import { shopContact } from "@/lib/shop-contact";
import styles from "./contact.module.css";

export async function generateMetadata() {
  const config = await getConfig();
  // The city in the title comes from the same cached lookup the maps use.
  return publicMetadata(config, "/contact", await seoOverride("/contact"), await geocode(config.shopAddress));
}

function ContactIcon({ kind }: { kind: "phone" | "email" }) {
  const paths = {
    phone: "M8 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-4l-5-2-2 2a14 14 0 0 1-6-6l2-2-2-5Z",
    email: "M3 5h18v14H3V5Zm0 1 9 7 9-7",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

export default async function ContactPage() {
  const config = await getConfig();
  const { phone, address, hasAddress } = shopContact(config);

  // The call and message buttons, condensed into the visit card's contact band.
  const contact = (
    <div className={styles.contactMethods}>
      <a href={`tel:${phone}`} className={`${styles.contactCard} ${styles.callCard}`}>
        <span className={styles.icon}><ContactIcon kind="phone" /></span>
        <span className={styles.cardCopy}><span className={styles.label}>Give us a ring</span><span className={styles.contactValue}>{phone}</span></span>
        <span className={styles.arrow} aria-hidden="true">↗</span>
      </a>
      <a href="#contact-form" className={`${styles.contactCard} ${styles.emailCard}`}>
        <span className={styles.icon}><ContactIcon kind="email" /></span>
        <span className={styles.cardCopy}><span className={styles.label}>Drop us a note</span><span className={styles.contactValue}>Send us a message</span></span>
        <span className={styles.arrow} aria-hidden="true">↗</span>
      </a>
    </div>
  );

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <div>
          <p className="public-eyebrow">Contact us · We&apos;re all ears</p>
          <h1 className={styles.title}>Say hello.<br /><span>Wags welcome.</span></h1>
          <p className={styles.lede}>Big questions, little quirks, first-time jitters.<br className={styles.desktopBreak} /> Let&apos;s make your pet&apos;s next visit a happy one.</p>
        </div>
        <div className={styles.helloBadge} aria-hidden="true">
          <span className={styles.sparkle}>✦</span>
          <OfficeIcon name="paw" />
          <span>Good humans.<br />Happy pets.</span>
          <span className={styles.smallSparkle}>✦</span>
        </div>
      </header>

      <ContactForm enabled={config.contactFormEnabled} requirePhone={config.contactRequirePhone} />

      {/* One module: the visit card, with the map sliding out from behind its
          left edge. The card carries the address and directions, so the map
          needs no words of its own; no address, no map, and the card stands alone. */}
      <section className={`${styles.visitModule} ${hasAddress ? styles.withMap : ""}`} aria-label="Plan your visit">
        <div className={styles.visitCard}><PublicVisitCard config={config} contact={contact} /></div>
        {hasAddress && <AddressMap address={address} title={`Map showing ${config.shopName}`} height={360} className={styles.map} credit />}
      </section>

      {config.featureOnlineBooking && (
        <section className={styles.booking} aria-labelledby="booking-heading">
          <span className={styles.bookingPaw} aria-hidden="true"><OfficeIcon name="paw" /></span>
          <div><p className="public-eyebrow">Less planning. More tail wagging.</p><h2 id="booking-heading">Their next good hair day starts here.</h2></div>
          <Link href="/portal" className={styles.bookingLink}>Book an appointment <span aria-hidden="true">↗</span></Link>
        </section>
      )}
    </div>
  );
}
