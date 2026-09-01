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

export async function sendReadyForPickup({
  to,
  ownerName,
  petName,
}: {
  to: string;
  ownerName: string;
  petName: string;
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
      ${config.shopPhone ? `<p>Questions? Call us at ${config.shopPhone}.</p>` : ""}
      <p>— ${config.shopName}</p>
    `,
  });
}
