import { publicMetadata } from "@/lib/seo";
import { seoOverride } from "@/lib/seo-pages";
import { geocode } from "@/lib/maps";
import Link from "next/link";
import ContactForm from "@/components/ContactForm";
import AddressMap from "@/components/AddressMap";
import PublicWeeklyHours from "@/components/PublicWeeklyHours";
import PublicShopStatus from "@/components/PublicShopStatus";
import OfficeIcon from "@/components/OfficeIcon";
import { shopAvailability } from "@/lib/shop-availability";
import { getConfig } from "@/lib/config";
import { shopContact } from "@/lib/shop-contact";
import styles from "./contact.module.css";

export async function generateMetadata() {
  const config = await getConfig();
  // The city in the title comes from the same cached lookup the maps use.
  return publicMetadata(config, "/contact", await seoOverride("/contact"), await geocode(config.shopAddress));
}

function ContactIcon({ kind }: { kind: "phone" | "email" | "pin" }) {
  const paths = {
    phone: "M8 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-4l-5-2-2 2a14 14 0 0 1-6-6l2-2-2-5Z",
    email: "M3 5h18v14H3V5Zm0 1 9 7 9-7",
    pin: "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

export default async function ContactPage() {
  const config = await getConfig();
  const { phone, address, hasAddress } = shopContact(config);
  const availability = shopAvailability(config);
  const visitHeading = availability.acceptingWalkIns ? "Come on over." : "Plan your next visit.";
  const visitNote = availability.acceptingWalkIns
    ? "We're open and welcoming walk-ins during our walk-in hours."
    : availability.shop?.open
      ? "We're open for scheduled appointments. Check our walk-in hours before dropping by."
      : availability.shop
        ? "We're closed right now. Check our opening hours to plan a good time to visit."
        : "Please contact us to confirm opening hours before heading over.";

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

      <div className={styles.contactMethods}>
        <a href={`tel:${phone}`} className={`${styles.contactCard} ${styles.callCard}`}>
          <span className={styles.icon}><ContactIcon kind="phone" /></span>
          <span className={styles.cardCopy}><span className={styles.label}>Give us a ring</span><span className={styles.contactValue}>{phone}</span><span className={styles.cardHint}>{availability.shop?.open ? "Let’s talk about your pet." : "Give us a call during opening hours."}</span></span>
          <span className={styles.arrow} aria-hidden="true">↗</span>
        </a>
        <a href="#contact-form" className={`${styles.contactCard} ${styles.emailCard}`}>
          <span className={styles.icon}><ContactIcon kind="email" /></span>
          <span className={styles.cardCopy}><span className={styles.label}>Drop us a note</span><span className={styles.contactValue}>Send us a message</span><span className={styles.cardHint}>We’d love to hear from you.</span></span>
          <span className={styles.arrow} aria-hidden="true">↗</span>
        </a>
      </div>

      <ContactForm enabled={config.contactFormEnabled} requirePhone={config.contactRequirePhone} />

      <div className={styles.layout}>
        <section className={styles.location} aria-labelledby="location-heading">
          <div className={styles.locationHeading}>
            <div><p className="public-eyebrow">Find us</p><h2 id="location-heading" className={styles.sectionTitle}>{visitHeading}</h2></div>
            <span className={styles.locationIcon}><ContactIcon kind="pin" /></span>
          </div>
          <p className={styles.visitNote}>{visitNote}</p>
          <p className={styles.shopName}>{config.shopName}</p>
          <address className={styles.address}>{address}</address>
          {hasAddress ? (
            <AddressMap address={address} title={`Map showing ${config.shopName}`} height={300} className={styles.map} />
          ) : (
            <div className={styles.locationPreview}>
              <span className={styles.previewPaw} aria-hidden="true"><OfficeIcon name="paw" /></span>
              <span className={styles.previewPin} aria-hidden="true"><ContactIcon kind="pin" /></span>
              <p>A happy place for paws.</p>
              <span className={styles.previewLabel}>Sample address · Map coming with your shop location</span>
            </div>
          )}
        </section>

        <section className={styles.hours} aria-labelledby="hours-heading">
          <div className={styles.hoursHeading}><span className="public-eyebrow">Plan your visit</span><OfficeIcon name="schedule" /></div>
          <h2 id="hours-heading" className={styles.sectionTitle}>Shop hours &amp; availability.</h2>
          <div className={styles.liveStatus}><PublicShopStatus config={config} /></div>
          <PublicWeeklyHours config={config} />
        </section>
      </div>

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
