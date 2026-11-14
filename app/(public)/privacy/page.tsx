import type { Metadata } from "next";
import { getConfig } from "@/lib/config";
import { isEnabled, twilioConfigured } from "@/lib/features";
import { activeProvider } from "@/lib/payments";
import { siteUrl } from "@/lib/seo";

/*
 * Written from what this shop actually runs, so it can never describe a
 * service it does not use: Twilio appears once its credentials are typed in,
 * Resend once there is a key, a card processor once one is live. The texting
 * terms appear with the credentials rather than with the switch, because a
 * carrier reviews this page while the shop's texting is still being approved.
 */

export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfig();
  const base = siteUrl(config);
  return {
    title: "Privacy Policy",
    description: `What ${config.shopName.trim()} keeps about you and your pets, why, and who else sees it.`,
    alternates: base ? { canonical: new URL("/privacy", base).href } : undefined,
    robots: { index: Boolean(base), follow: true },
  };
}

export default async function PrivacyPage() {
  const config = await getConfig();
  const name = config.shopName.trim();
  // The saved details only. shopContact() fills gaps with sample ones, and a
  // privacy request sent to a sample address goes nowhere.
  const email = config.shopEmail?.trim();
  const phone = config.shopPhone?.trim();
  const address = config.shopAddress?.trim();

  const texts = twilioConfigured(config);
  const calls = isEnabled(config, "featureVoiceCalls");
  const mail = Boolean(process.env.RESEND_API_KEY?.trim());
  const card = isEnabled(config, "featureCounterPayments") ? activeProvider(config.paymentProvider) : null;
  const reviews = isEnabled(config, "featureTestimonials");

  const band = "mt-6 border-t border-line/70 pt-6";
  const heading = "text-lg font-bold text-ink";
  const body = "mt-2 space-y-2 text-muted";
  const list = "mt-2 list-disc space-y-1 pl-5 text-muted";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <article className="glass-panel rounded-3xl p-6 md:p-10" aria-labelledby="privacy-heading">
        <h1 id="privacy-heading" className="public-section-title text-ink">Privacy Policy</h1>
        <p className="mt-4 text-muted">
          {name} keeps the details you give us so we can groom your pets safely and keep you posted about their
          visits. This page says what we keep, why, and who else sees it.
        </p>

        <section className={band}>
          <h2 className={heading}>What we keep</h2>
          <ul className={list}>
            <li>Your name, email, phone number and address, and the people you approve to drop off or collect your pets.</li>
            <li>Your pets&apos; details: name, breed, weight, photos, health and behaviour notes, vaccination records and your vet&apos;s contact details.</li>
            <li>Each visit: the appointment, the services and prices, notes on the groom, and anything that happened during it.</li>
            <li>Documents you sign with us, with your typed name, your drawn signature and the date.</li>
            <li>Messages you send us through this website.</li>
            <li>If you have an account, your password, stored only in a form that cannot be read back.</li>
          </ul>
        </section>

        <section className={band}>
          <h2 className={heading}>Why</h2>
          <div className={body}>
            <p>
              To book and groom your pets, to keep them safe while they are with us, and to contact you about their
              visits. We do not sell your information, and we do not use it for advertising.
            </p>
            {reviews && (
              <p>If you write a review and we publish it, it shows your first name, your last initial and your pet&apos;s name.</p>
            )}
          </div>
        </section>

        <section className={band}>
          <h2 className={heading}>Cookies</h2>
          <p className={body}>
            This site uses cookies only to keep you signed in and to protect its sign-in forms. There are no advertising
            or tracking cookies.
          </p>
        </section>

        <section className={band}>
          <h2 className={heading}>Who else sees it</h2>
          <p className={body}>Only the services that run this website, and only what each one needs:</p>
          <ul className={list}>
            <li>The company that hosts our server stores the site and its data.</li>
            {mail && <li>Email is delivered by Resend, which receives your email address and the message.</li>}
            {texts && (
              <li>Text messages{calls ? " and calls" : ""} go through Twilio, which receives your phone number and the message.</li>
            )}
            {card && (
              <li>
                Card payments are taken on our card reader through {card.label}. We never see or keep your card number,
                only the amount and a reference.
              </li>
            )}
            <li>Addresses are looked up on OpenStreetMap to show them on a map, and the map on this site loads from OpenStreetMap.</li>
          </ul>
          <p className={body}>We would also share information if the law required us to.</p>
        </section>

        {texts && (
          <section className={band}>
            <h2 className={heading}>Text messages</h2>
            <div className={body}>
              <p>
                If you give us a mobile number, we may text you about your pets&apos; visits: booking confirmations,
                reminders, when your pet is ready to collect, questions about a groom, a note when a visit is due, and
                openings when an appointment frees up. How often depends on your visits. Message and data rates may
                apply. Reply STOP to stop texts, or HELP for help.
              </p>
              <p>We never share your mobile number or your consent to receive texts with anyone for marketing or promotional purposes.</p>
              {calls && (
                <p>
                  We may also call with an automated message when your pet is ready or a groom needs to change. You can
                  turn calls off on your profile, or ask us to.
                </p>
              )}
            </div>
          </section>
        )}

        <section className={band}>
          <h2 className={heading}>Your choices</h2>
          <div className={body}>
            <p>If you have an account on this site, you can see and change your details on your profile.</p>
            <p>
              Ask us and we will correct your information or delete it. We may keep the record of a past visit where we
              need it, for example after an incident during a groom.
            </p>
          </div>
        </section>

        <section className={band}>
          <h2 className={heading}>Questions</h2>
          <p className={body}>Ask us about anything on this page{email || phone || address ? ":" : " at the shop."}</p>
          {(email || phone || address) && (
            <ul className={list}>
              {email && <li><a href={`mailto:${email}`} className="text-brand-text underline">{email}</a></li>}
              {phone && <li><a href={`tel:${phone}`} className="text-brand-text underline">{phone}</a></li>}
              {address && <li>{address}</li>}
            </ul>
          )}
        </section>
      </article>
    </div>
  );
}
