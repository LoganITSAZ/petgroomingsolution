import { Resend } from "resend";
import { getConfig } from "@/lib/config";
import { DEFAULT_SHOP_NAME, SHOP_MAIL_DOMAIN } from "@/lib/branding";

/**
 * Lazily constructed Resend client.
 *
 * `new Resend(undefined)` throws, and Next evaluates route modules at build
 * time while collecting page data — so constructing this at module scope makes
 * `next build` fail on any machine without RESEND_API_KEY set (CI, the Docker
 * image build). Returns null when no key is configured; callers no-op.
 */
let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

async function getFrom(): Promise<string> {
  const config = await getConfig();
  // The display name is the shop's name. There is no separate "from name" to
  // set and drift out of step with it.
  return config.emailFromAddress
    ? `${config.shopName} <${config.emailFromAddress}>`
    : process.env.EMAIL_FROM ?? `${DEFAULT_SHOP_NAME} <no-reply@${SHOP_MAIL_DOMAIN}>`;
}

export async function sendBookingConfirmation({
  to,
  ownerName,
  petName,
  scheduledAt,
  serviceType,
}: {
  to: string;
  ownerName: string;
  petName: string;
  scheduledAt: Date;
  serviceType: string;
}) {
  const config = await getConfig();
  if (!config.featureEmailNotify) return;

  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY is not set — skipping booking confirmation email");
    return;
  }

  const from = await getFrom();
  const dateStr = scheduledAt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  await resend.emails.send({
    from,
    to,
    subject: `Appointment confirmed for ${petName} — ${config.shopName}`,
    html: `
      <p>Hi ${ownerName},</p>
      <p>Your appointment for <strong>${petName}</strong> has been confirmed.</p>
      <ul>
        <li><strong>Date:</strong> ${dateStr}</li>
        <li><strong>Service:</strong> ${serviceType.replace(/_/g, " ")}</li>
      </ul>
      <p>You can check in online when you arrive at the shop.</p>
      <p>— ${config.shopName}</p>
    `,
  });
}

/**
 * The "forgot my password" link.
 *
 * Deliberately *not* behind `featureEmailNotify`. That flag governs whether the
 * shop mails customers about their visits; switching it off must not lock every
 * account holder out of the account they already have.
 */
export async function sendPasswordReset({
  to,
  name,
  url,
  expiresInMins,
}: {
  to: string;
  name: string;
  url: string;
  expiresInMins: number;
}) {
  const config = await getConfig();

  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY is not set — skipping password reset email");
    return;
  }

  const from = await getFrom();

  await resend.emails.send({
    from,
    to,
    subject: `Reset your ${config.shopName} password`,
    html: `
      <p>Hi ${name},</p>
      <p>Someone asked to reset the password on your ${config.shopName} account.
         If that was you, use the link below.</p>
      <p><a href="${url}">Choose a new password</a></p>
      <p>This link works once and expires in ${expiresInMins} minutes.</p>
      <p>If you did not ask for this, you can ignore this email — nothing has
         changed on your account.</p>
      <p>— ${config.shopName}</p>
    `,
  });
}

/**
 * Notes typed by a groomer, going into an email body. Escaped rather than
 * trusted: staff are not attackers, but a `<` in "coat <1 inch" should reach
 * the owner as a `<` rather than swallowing the rest of the sentence.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * `findings` are the visit events staff ticked as the owner's to see — a hot
 * ear, a lump, fleas. They ride on this message because the pet being ready is
 * the moment the owner is actually reading, and a finding nobody passes on is
 * the single thing owners say separates a groomer from a good one.
 */
export async function sendReadyForPickup({
  to,
  ownerName,
  petName,
  findings = [],
  hasPhotos = false,
}: {
  to: string;
  ownerName: string;
  petName: string;
  findings?: string[];
  /** Photos are linked, never attached: the portal already gates the bytes. */
  hasPhotos?: boolean;
}) {
  const config = await getConfig();
  if (!config.featureEmailNotify) return;

  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY is not set — skipping ready-for-pickup email");
    return;
  }

  const from = await getFrom();

  await resend.emails.send({
    from,
    to,
    subject: `${petName} is ready for pickup! 🐾`,
    html: `
      <p>Hi ${ownerName},</p>
      <p><strong>${petName}</strong> is all done and ready to be picked up!</p>
      <p>Please come by at your earliest convenience.</p>
      ${
        findings.length
          ? `<p>While we were working, we noticed a few things worth mentioning:</p>
      <ul>${findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join("")}</ul>
      <p>We are groomers, not vets — this is just what we saw, and your
         veterinarian is the one to ask about any of it.</p>`
          : ""
      }
      ${
        hasPhotos
          ? `<p>We took a few photos of ${escapeHtml(petName)} today — they are on your visit in the customer portal.</p>`
          : ""
      }
      ${config.shopPhone ? `<p>Questions? Call us at ${config.shopPhone}.</p>` : ""}
      <p>— ${config.shopName}</p>
    `,
  });
}

/**
 * "We need your say-so before we carry on."
 *
 * Sent when a groom cannot be finished as booked — matting found under the
 * coat, a pelt that has to come off. Behind `featureEmailNotify` like the
 * other visit mail: a shop with notifications off rings the owner instead, and
 * the request is recorded on the visit either way.
 */
export async function sendConsentRequest({
  to,
  ownerName,
  petName,
  note,
}: {
  to: string;
  ownerName: string;
  petName: string;
  note: string;
}) {
  const config = await getConfig();
  if (!config.featureEmailNotify) return;

  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY is not set — skipping consent request email");
    return;
  }

  const from = await getFrom();

  await resend.emails.send({
    from,
    to,
    subject: `We need your OK for ${petName}'s groom`,
    html: `
      <p>Hi ${ownerName},</p>
      <p>We have had to stop partway through <strong>${petName}</strong>'s groom
         and would like your say-so before we carry on:</p>
      <blockquote style="border-left:3px solid #ccc;margin:0;padding:0 0 0 12px">
        ${escapeHtml(note)}
      </blockquote>
      <p>Please call us and we will talk it through — nothing else happens until
         we hear from you.</p>
      ${config.shopPhone ? `<p><strong>${config.shopPhone}</strong></p>` : ""}
      <p>— ${config.shopName}</p>
    `,
  });
}
