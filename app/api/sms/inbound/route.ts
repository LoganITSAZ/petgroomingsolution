import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { toE164 } from "@/lib/phone";
import { siteUrl } from "@/lib/seo";
import { readInboundReply, verifyTwilioSignature } from "@/lib/sms-inbound";
import { consentState } from "@/lib/visit-record";

/**
 * The one inbound message the shop is waiting on: yes or no to a change in a
 * groom it has already asked about.
 *
 * This is not a text inbox. Anything that is not plainly an answer, and any
 * number with nothing open, is answered with the shop's phone number — the
 * consent conversation was built around a phone call and stays that way.
 *
 * The endpoint is public and it writes consent, so signature verification is
 * not optional and there is no unsigned path through it.
 */

/** A request older than this is somebody replying to a different conversation. */
const REPLY_WINDOW_DAYS = 3;

function twiml(message?: string) {
  const body = message
    ? `<Response><Message>${message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))}</Message></Response>`
    : "<Response/>";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * The URL Twilio signed is the one the shop pasted into the console, which is
 * not what the app sees behind nginx. The saved `shopWebsite` is the origin
 * everything else public is built from, and the forwarded headers are the
 * fallback for a shop that has not saved one yet.
 */
function candidateUrls(req: Request, origin: URL | undefined): string[] {
  const path = new URL(req.url).pathname;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return [
    ...(origin ? [new URL(path, origin).href] : []),
    ...(host ? [`${proto}://${host}${path}`] : []),
  ];
}

export async function POST(req: Request) {
  const config = await getConfig();
  const authToken = config.twilioAuthToken?.trim();
  // Off is silence: a shop that does not text has no consent replies to read,
  // and without a token nothing here can be verified, so nothing is answered.
  if (!config.featureSmsNotify || !authToken) return new Response(null, { status: 404 });

  const form = new URLSearchParams(await req.text());
  const params = Object.fromEntries(form);
  const signature = req.headers.get("x-twilio-signature");
  const signed = candidateUrls(req, siteUrl(config)).some((url) =>
    verifyTwilioSignature(authToken, url, params, signature)
  );
  if (!signed) return new Response(null, { status: 403 });

  const from = toE164(form.get("From"));
  if (!from) return twiml();
  const reply = readInboundReply(form.get("Body"));

  // A carrier keyword says nothing about the dog's coat, so it is recorded as
  // what it is and the conversation is left where it was.
  if (reply === "optout") {
    await prisma.customer.updateMany({ where: { phone: { contains: from.slice(-10) } }, data: { smsOptOut: true } });
    return twiml();
  }

  const since = new Date(Date.now() - REPLY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // `Customer.phone` is free text, so the last ten digits are the widest match
  // the database can make and `toE164` settles it in code.
  const open = await prisma.appointment.findMany({
    where: {
      consentRequestedAt: { gte: since },
      customer: { phone: { contains: from.slice(-10) } },
    },
    orderBy: { consentRequestedAt: "desc" },
    select: {
      id: true,
      consentRequestedAt: true,
      consentGrantedAt: true,
      consentDeclinedAt: true,
      pet: { select: { name: true } },
      customer: { select: { phone: true } },
    },
  });
  const pending = open.find(
    (visit) => toE164(visit.customer.phone) === from && consentState(visit) === "pending"
  );

  const callUs = config.shopPhone ? ` Please call ${config.shopPhone}.` : " Please call the shop.";
  if (!pending) return twiml(`Thanks — we do not monitor texts.${callUs}`);
  if (reply === "unclear") return twiml(`Thanks — we cannot answer by text.${callUs}`);

  const now = new Date();
  await prisma.appointment.update({
    where: { id: pending.id },
    // Both columns are written together, same as the counter's own form, so the
    // pair always holds one answer rather than two that contradict.
    data: {
      consentGrantedAt: reply === "granted" ? now : null,
      consentDeclinedAt: reply === "declined" ? now : null,
    },
  });

  return twiml(
    reply === "granted"
      ? `Thank you — we will carry on with ${pending.pet.name}'s groom.`
      : `Understood, we will leave ${pending.pet.name}'s groom as booked.${callUs}`
  );
}
