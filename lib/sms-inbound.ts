import { createHmac, timingSafeEqual } from "crypto";

/**
 * The inbound half of SMS, and the only one there is.
 *
 * The shop does not have a text inbox — an inbox nobody reads is worse than no
 * inbox, because the owner believes they have replied. What this handles is the
 * one message the shop is already waiting on: yes or no to a change in a groom
 * it has asked about. Everything else gets told to ring the shop.
 *
 * Both halves here are pure so they can be tested without a request: the
 * signature check is what makes a public endpoint safe to write consent from,
 * and the reply reading is what must never turn "not ok" into a yes.
 */

/**
 * Twilio's request signature: HMAC-SHA1 over the full URL it called plus every
 * POST field, sorted by name and concatenated name-then-value, in base64.
 *
 * The comparison is timing-safe, and a length mismatch is rejected before the
 * compare because `timingSafeEqual` throws on unequal buffers.
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(payload, "utf8")).digest("base64");
}

export function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null | undefined
): boolean {
  if (!authToken || !signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * What the owner said.
 *
 * `optout` is the carrier keyword set, kept separate from `declined`: someone
 * who texts STOP has said nothing at all about their dog's coat, and recording
 * that as a refusal would put words in their mouth.
 *
 * Anything that is not plainly one answer is `unclear`, which the shop answers
 * with a phone number. A guess here is a shave-down nobody agreed to.
 */
export type InboundReply = "granted" | "declined" | "optout" | "unclear";

const OPT_OUT = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout"]);
const YES = new Set(["yes", "y", "ya", "yeah", "yep", "yup", "ok", "okay", "k", "sure", "approve", "approved", "agree", "agreed", "proceed", "confirm", "confirmed"]);
const NO = new Set(["no", "n", "nope", "nah", "dont", "decline", "declined", "refuse", "negative", "stop", "wait", "hold"]);
// Phrases, because on their own "go", "do" and "please" open the door to
// "please stop the groom" reading as a yes.
const YES_PHRASES = [["go", "ahead"], ["do", "it"], ["carry", "on"], ["please", "do"], ["go", "for", "it"]];

export function readInboundReply(body: string | null | undefined): InboundReply {
  const words = (body ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/'/g, ""));
  if (words.length === 0) return "unclear";

  if (words.length <= 2 && words.some((word) => OPT_OUT.has(word))) return "optout";
  // Negation beats agreement: "do not", "not ok" and "no go" all lead with a
  // word from the yes list or end on one, and every one of them is a refusal.
  if (words.some((word) => word === "not" || NO.has(word))) return "declined";
  if (YES.has(words[0])) return "granted";
  if (YES_PHRASES.some((phrase) => phrase.every((word, index) => words[index] === word))) return "granted";
  return "unclear";
}
