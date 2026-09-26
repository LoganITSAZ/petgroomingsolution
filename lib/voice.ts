import { getConfig } from "@/lib/config";
import { toE164 } from "@/lib/phone";
import { joinPetNames } from "@/lib/visit-time";

/**
 * Automated calls, through the same Twilio REST API the texts go out on.
 *
 * Same shape as [lib/sms.ts](lib/sms.ts) on purpose: credentials off
 * `SystemConfig`, one authenticated POST, no SDK, and nothing here throws — a
 * carrier problem must never fail a status change.
 *
 * What differs is consent. `featureVoiceCalls` is its own flag rather than a
 * corner of `featureSmsNotify`, because a shop that texts has not agreed to
 * ring people, and `Customer.voiceOptOut` is its own column for the same reason
 * from the other side.
 *
 * The speech is sent as TwiML in the request, so there is no callback URL to
 * host and nothing public to configure.
 */

const TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts";

/**
 * A spoken message, as TwiML.
 *
 * The pause is what stops the first words being lost while somebody moves the
 * phone to their ear, and the message is said twice because a caller cannot ask
 * for it again. `&`, `<` and `>` are escaped: a shop called "Bark & Bubbles"
 * would otherwise produce a document Twilio rejects.
 */
export function sayTwiml(message: string): string {
  const escaped = message.replace(/[<>&"']/g, (character) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[character] as string)
  );
  const say = `<Say voice="Polly.Joanna">${escaped}</Say>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/>${say}<Pause length="1"/>${say}</Response>`;
}

/** The shop's Twilio setup for calls, or null if calling is off or half-configured. */
async function credentials() {
  const config = await getConfig();
  if (!config.featureVoiceCalls) return null;

  const accountSid = config.twilioAccountSid?.trim();
  const authToken = config.twilioAuthToken?.trim();
  const from = config.twilioFromNumber?.trim();
  if (!accountSid || !authToken || !from) {
    console.warn("Voice calls are switched on but Twilio is not fully configured — skipping call");
    return null;
  }
  return { accountSid, authToken, from };
}

/** Ring one number and say one thing. Returns whether the call was placed. */
export async function placeCall(to: string | null | undefined, message: string): Promise<boolean> {
  const creds = await credentials();
  if (!creds) return false;

  const recipient = toE164(to);
  if (!recipient) return false;

  try {
    const response = await fetch(`${TWILIO_API}/${creds.accountSid}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: creds.from, To: recipient, Twiml: sayTwiml(message) }),
    });
    if (!response.ok) {
      console.error(`Twilio refused a call (${response.status}):`, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Could not reach Twilio:", error);
    return false;
  }
}

/**
 * The call that says the dog is ready.
 *
 * Spoken, so it is written the way somebody says it rather than the way a text
 * is written: no "reply STOP", and the shop's number read out digit by digit is
 * worse than "call the shop back", which the owner's phone log already answers.
 */
export async function voiceReadyForPickup({
  to,
  pets,
  shopName,
}: {
  to: string | null | undefined;
  pets: string[];
  shopName: string;
}): Promise<boolean> {
  const { names, verb } = joinPetNames(pets);
  return placeCall(to, `Hello, this is ${shopName}. ${names} ${verb} finished and ready to collect. Thank you.`);
}

/**
 * The call that goes with the consent request.
 *
 * It says there is a question and asks for a call back; it does not say what
 * the question is. A groom that has to change is a conversation, and a recorded
 * voice reading out a shave-down is how a shop loses a customer.
 */
export async function voiceConsentRequest({
  to,
  petName,
  shopName,
}: {
  to: string | null | undefined;
  petName: string;
  shopName: string;
}): Promise<boolean> {
  return placeCall(
    to,
    `Hello, this is ${shopName}. We have a question about ${petName}'s groom before we carry on. Please call us back when you can. Thank you.`
  );
}
