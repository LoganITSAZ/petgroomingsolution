import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendPasswordReset } from "@/lib/email";
import { PasswordResetSubject } from "@prisma/client";

/**
 * Forgotten passwords, for both sign-in tables.
 *
 * The shape is the ordinary one and the details are the point:
 *
 *  - the emailed token is random and only its sha256 is stored, so the table is
 *    useless to anyone who reads it;
 *  - requesting a reset never says whether the address is on file. A "no such
 *    account" reply turns this form into a way to ask who the shop's customers
 *    are;
 *  - issuing a link retires every earlier one for that account, and spending a
 *    link retires it, so a reset mail forwarded or left in an inbox stops
 *    working as soon as it is used or superseded.
 */

/** Long enough that guessing is not a strategy. */
const TOKEN_BYTES = 32;

/** Short enough that a mail left in an inbox stops being a key by morning. */
const TTL_MS = 60 * 60 * 1000;

/** The shortest password the shop will accept, matching registration. */
export const MIN_PASSWORD_LENGTH = 8;

export type ResetSubject = "customer" | "staff";

const SUBJECTS: Record<ResetSubject, PasswordResetSubject> = {
  customer: PasswordResetSubject.CUSTOMER,
  staff: PasswordResetSubject.STAFF,
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Where the emailed link points. */
function resetUrl(token: string): string {
  const base = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    ""
  );
  return `${base}/reset-password?token=${token}`;
}

/**
 * Start a reset.
 *
 * Resolves the same way whether or not the address is on file — the caller has
 * nothing to tell the visitor apart with, which is deliberate.
 */
export async function requestPasswordReset(email: string, subject: ResetSubject): Promise<void> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return;

  const account =
    subject === "staff"
      ? await prisma.staff.findUnique({
          where: { email: normalised },
          select: { id: true, name: true, email: true, isActive: true },
        })
      : await prisma.customer.findUnique({
          where: { email: normalised },
          select: { id: true, firstName: true, email: true, isActive: true },
        });

  // A deactivated account is not a way back in either.
  if (!account || !account.isActive) return;

  const token = randomBytes(TOKEN_BYTES).toString("hex");

  // One live link per account: asking again invalidates the mail already sent.
  await prisma.$transaction([
    prisma.passwordReset.deleteMany({
      where: { subject: SUBJECTS[subject], subjectId: account.id, usedAt: null },
    }),
    prisma.passwordReset.create({
      data: {
        tokenHash: hashToken(token),
        subject: SUBJECTS[subject],
        subjectId: account.id,
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    }),
  ]);

  const name = "name" in account ? account.name : account.firstName;
  // A send that fails must not tell the visitor their address is on file, so
  // the error is logged rather than thrown.
  await sendPasswordReset({
    to: account.email,
    name,
    url: resetUrl(token),
    expiresInMins: Math.round(TTL_MS / 60000),
  }).catch(console.error);
}

export type ResetResult =
  | { ok: true; subject: ResetSubject }
  | { ok: false; reason: "invalid" | "expired" | "used" | "weak" };

/**
 * Spend a reset link and set the new password.
 *
 * Every failure mode is distinguished for the person holding the link, because
 * a token nobody can guess is not a secret worth protecting once someone has
 * it — "this expired" is what tells them to ask for another.
 */
export async function consumePasswordReset(
  token: string,
  newPassword: string
): Promise<ResetResult> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "weak" };

  const record = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(token.trim()) },
  });
  if (!record) return { ok: false, reason: "invalid" };
  if (record.usedAt) return { ok: false, reason: "used" };
  if (record.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const subject: ResetSubject = record.subject === PasswordResetSubject.STAFF ? "staff" : "customer";

  // Spending the link and setting the password are one write: a crash between
  // them would otherwise leave a link that still opens an account it changed.
  await prisma.$transaction([
    subject === "staff"
      ? prisma.staff.update({ where: { id: record.subjectId }, data: { passwordHash } })
      : prisma.customer.update({ where: { id: record.subjectId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Any other link outstanding for this account dies with it.
    prisma.passwordReset.deleteMany({
      where: { subject: record.subject, subjectId: record.subjectId, usedAt: null },
    }),
  ]);

  return { ok: true, subject };
}

/**
 * Whether a token is worth showing a form for.
 *
 * The reset page checks before rendering so someone on a dead link is told so
 * rather than typing a new password twice to find out.
 */
export async function inspectResetToken(
  token: string
): Promise<"ok" | "invalid" | "expired" | "used"> {
  const record = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(token.trim()) },
    select: { usedAt: true, expiresAt: true },
  });
  if (!record) return "invalid";
  if (record.usedAt) return "used";
  if (record.expiresAt.getTime() <= Date.now()) return "expired";
  return "ok";
}
