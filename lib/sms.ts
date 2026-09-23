import { getConfig } from "@/lib/config";
import { toE164 } from "@/lib/phone";

/**
 * Text messages, through Twilio's REST API.
 *
 * The credentials live on `SystemConfig`, not in the environment, because the
 * shop types them into `/admin/notifications` — so there is no client to build
 * at module scope and nothing to throw during `next build`. Sending is a single
 * authenticated POST, which is why there is no SDK dependency here.
 *
 * Nothing in this file throws. A carrier outage must never fail a status
 * change, exactly like the email sends it sits beside.
 */

const TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts";

type Credentials = { accountSid: string; authToken: string; from: string };

/** The shop's Twilio setup, or null if SMS is off or half-configured. */
async function credentials(): Promise<Credentials | null> {
  const config = await getConfig();
  if (!config.featureSmsNotify) return null;

  const accountSid = config.twilioAccountSid?.trim();
  const authToken = config.twilioAuthToken?.trim();
  const from = config.twilioFromNumber?.trim();
  if (!accountSid || !authToken || !from) {
    console.warn("SMS is switched on but Twilio is not fully configured — skipping send");
    return null;
  }
  return { accountSid, authToken, from };
}

/**
 * Send one message. Returns whether it went.
 *
 * `to` is whatever the shop typed in the customer's phone field; a number that
 * cannot be made into E.164 is skipped rather than sent and bounced.
 */
export async function sendSms(to: string | null | undefined, body: string): Promise<boolean> {
  const creds = await credentials();
  if (!creds) return false;

  const recipient = toE164(to);
  if (!recipient) return false;

  try {
    const response = await fetch(`${TWILIO_API}/${creds.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: creds.from, To: recipient, Body: body }),
    });

    if (!response.ok) {
      // Twilio explains itself in the body; the status alone is not enough to
      // tell a bad number from a suspended account.
      console.error(`Twilio refused a message (${response.status}):`, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Could not reach Twilio:", error);
    return false;
  }
}

/**
 * The pickup text.
 *
 * Kept short on purpose: a segment is 160 characters and the shop pays by the
 * segment, so the shop name and the pet's name are the whole message.
 */
export async function smsReadyForPickup({
  to,
  petName,
  shopName,
  phone,
  hasFindings = false,
}: {
  to: string | null | undefined;
  petName: string;
  shopName: string;
  phone?: string | null;
  hasFindings?: boolean;
}): Promise<boolean> {
  // The findings themselves go in the email and are read out at the counter.
  // A text says there are some: a segment is 160 characters, and a groomer's
  // note about an ear is not worth cutting in half to save a phone call.
  const body =
    `${petName} is ready for pickup at ${shopName}.` +
    (hasFindings ? ` We noticed a couple of things to mention when you collect.` : "") +
    (phone ? ` Questions? ${phone}` : "") +
    ` Reply STOP to opt out.`;
  return sendSms(to, body);
}

/** The booking text, sent beside the confirmation email. */
export async function smsBookingConfirmation({
  to,
  petName,
  shopName,
  when,
}: {
  to: string | null | undefined;
  petName: string;
  shopName: string;
  when: string;
}): Promise<boolean> {
  return sendSms(to, `${shopName}: ${petName} is booked for ${when}. Reply STOP to opt out.`);
}

/**
 * The reminder text. One segment: the pet, when, and how to reach the shop.
 */
export async function smsAppointmentReminder({
  to,
  petName,
  shopName,
  when,
  phone,
}: {
  to: string | null | undefined;
  petName: string;
  shopName: string;
  when: string;
  phone?: string | null;
}): Promise<boolean> {
  return sendSms(
    to,
    `${shopName}: reminder, ${petName} is booked for ${when}.` +
      (phone ? ` Changes? ${phone}` : "") +
      ` Reply STOP to opt out.`
  );
}

/**
 * The rebooking text. One segment, and it asks rather than tells: a shop that
 * texts "your dog is due" is claiming something only a vet can.
 */
export async function smsRebookingPrompt({
  to,
  petNames,
  shopName,
  daysSince,
  phone,
}: {
  to: string | null | undefined;
  petNames: string[];
  shopName: string;
  daysSince: number;
  phone?: string | null;
}): Promise<boolean> {
  const pets = petNames.length > 0 ? petNames.join(" and ") : "your pet";
  return sendSms(
    to,
    `${shopName}: it has been about ${daysSince} days since ${pets} was in. Book again?` +
      (phone ? ` ${phone}` : "") +
      ` Reply STOP to opt out.`
  );
}

/**
 * The text that goes with the consent email. Deliberately does not carry the
 * detail: what is being asked needs a conversation, and a fee quoted in a text
 * message is the kind of thing a shop ends up arguing about at the counter.
 *
 * It offers YES and NO because /api/sms/inbound reads exactly those — one
 * answer, recorded against this visit. Anything else still gets a phone call.
 */
export async function smsConsentRequest({
  to,
  petName,
  shopName,
  phone,
}: {
  to: string | null | undefined;
  petName: string;
  shopName: string;
  phone?: string | null;
}): Promise<boolean> {
  return sendSms(
    to,
    `${shopName}: we need a quick word about ${petName}'s groom before we carry on.` +
      ` Reply YES to go ahead or NO to leave it as booked` +
      (phone ? `, or call ${phone}.` : ".") +
      ` Reply STOP to opt out.`
  );
}

/**
 * The same offer in one segment. No link: the shop takes the booking by phone,
 * so the message only has to say what is free and who to ring.
 */
export async function smsSlotOffer({
  to,
  petNames,
  shopName,
  when,
  phone,
}: {
  to: string | null | undefined;
  petNames: string[];
  shopName: string;
  when: string;
  phone?: string | null;
}): Promise<boolean> {
  const pets = petNames.length > 0 ? petNames.join(" and ") : "your pet";
  return sendSms(
    to,
    `${shopName}: opening ${when} — about right for ${pets}. Call to take it.` +
      (phone ? ` ${phone}` : "") +
      ` Reply STOP opt out.`
  );
}
