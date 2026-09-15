import { Resend } from "resend";
import { getConfig } from "@/lib/config";
import { DEFAULT_SHOP_NAME, SHOP_MAIL_DOMAIN } from "@/lib/branding";
import { formatShopDate, formatShopTime } from "@/lib/utils";

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
      <p>Hi ${escapeHtml(ownerName)},</p>
      <p>Your appointment for <strong>${escapeHtml(petName)}</strong> has been confirmed.</p>
      <ul>
        <li><strong>Date:</strong> ${dateStr}</li>
        <li><strong>Service:</strong> ${escapeHtml(serviceType.replace(/_/g, " "))}</li>
      </ul>
      <p>You can check in online when you arrive at the shop.</p>
      <p>— ${escapeHtml(config.shopName)}</p>
    `,
  });
}

/**
 * The day-before reminder, sent by the job runner rather than a request.
 *
 * Behind `featureEmailNotify` like the other visit mail: a shop that has
 * switched customer email off has said what it wants.
 */
export async function sendAppointmentReminder({
  to,
  ownerName,
  petName,
  scheduledAt,
}: {
  to: string;
  ownerName: string;
  petName: string;
  scheduledAt: Date;
}) {
  const config = await getConfig();
  if (!config.featureEmailNotify) return;

  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY is not set — skipping appointment reminder email");
    return;
  }

  const from = await getFrom();
  // Shop time, never the server's: production runs in UTC.
  const when = `${formatShopDate(scheduledAt)} at ${formatShopTime(scheduledAt)}`;

  await resend.emails.send({
    from,
    to,
    subject: `Reminder: ${petName} is booked for ${formatShopDate(scheduledAt)}`,
    html: `
      <p>Hi ${escapeHtml(ownerName)},</p>
      <p>Just a reminder that <strong>${escapeHtml(petName)}</strong> is booked in with us on
         <strong>${when}</strong>.</p>
      ${
        config.shopPhone
          ? `<p>If anything has changed, call us on ${escapeHtml(config.shopPhone)}.</p>`
          : `<p>If anything has changed, let us know.</p>`
      }
      <p>— ${escapeHtml(config.shopName)}</p>
    `,
  });
}

/**
 * "It has been a while." The rebooking nudge, sent by the job runner.
 *
 * It says how long it has been and how to book, and nothing about what the pet
 * needs -- the shop grooms, it does not prescribe. Behind `featureEmailNotify`
 * like the rest of the customer mail.
 */
export async function sendRebookingPrompt({
  to,
  ownerName,
  petNames,
  daysSince,
}: {
  to: string;
  ownerName: string;
  petNames: string[];
  daysSince: number;
}) {
  const config = await getConfig();
  if (!config.featureEmailNotify) return;

  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY is not set — skipping rebooking email");
    return;
  }

  const from = await getFrom();
  const pets = petNames.length > 0 ? petNames.join(" and ") : "your pet";

  await resend.emails.send({
    from,
    to,
    subject: `Time to book ${pets} in again?`,
    html: `
      <p>Hi ${escapeHtml(ownerName)},</p>
      <p>It has been about ${daysSince} days since we last saw
         <strong>${escapeHtml(pets)}</strong>, and there is nothing on our books
         yet. If you would like the usual slot, it is worth booking soon.</p>
      ${
        config.shopPhone
          ? `<p>Call us on ${escapeHtml(config.shopPhone)} and we will find a time.</p>`
          : `<p>Reply to this email and we will find a time.</p>`
      }
      <p>— ${escapeHtml(config.shopName)}</p>
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
      <p>Hi ${escapeHtml(name)},</p>
      <p>Someone asked to reset the password on your ${escapeHtml(config.shopName)} account.
         If that was you, use the link below.</p>
      <p><a href="${url}">Choose a new password</a></p>
      <p>This link works once and expires in ${expiresInMins} minutes.</p>
      <p>If you did not ask for this, you can ignore this email — nothing has
         changed on your account.</p>
      <p>— ${escapeHtml(config.shopName)}</p>
    `,
  });
}

/**
 * Anything typed by a person, going into an email body. Escaped rather than
 * trusted: staff are not attackers, but a `<` in "coat <1 inch" should reach
 * the owner as a `<` rather than swallowing the rest of the sentence, and a
 * name or a shop detail is no more trustworthy than a note.
 *
 * Every slot in every body above goes through this. A subject line does not —
 * it is plain text, and an escaped one reads `&amp;` to the customer.
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
      <p>Hi ${escapeHtml(ownerName)},</p>
      <p><strong>${escapeHtml(petName)}</strong> is all done and ready to be picked up!</p>
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
      ${config.shopPhone ? `<p>Questions? Call us at ${escapeHtml(config.shopPhone)}.</p>` : ""}
      <p>— ${escapeHtml(config.shopName)}</p>
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
      <p>Hi ${escapeHtml(ownerName)},</p>
      <p>We have had to stop partway through <strong>${escapeHtml(petName)}</strong>'s groom
         and would like your say-so before we carry on:</p>
      <blockquote style="border-left:3px solid #ccc;margin:0;padding:0 0 0 12px">
        ${escapeHtml(note)}
      </blockquote>
      <p>Please call us and we will talk it through — nothing else happens until
         we hear from you.</p>
      ${config.shopPhone ? `<p><strong>${escapeHtml(config.shopPhone)}</strong></p>` : ""}
      <p>— ${escapeHtml(config.shopName)}</p>
    `,
  });
}
