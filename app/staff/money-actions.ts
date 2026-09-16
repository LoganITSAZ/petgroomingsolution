"use server";

import { PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFeature, requireStaff } from "@/lib/auth-guards";
import { parseDollarsToCents } from "@/lib/pricing";
import { abovePublishedRange } from "@/lib/ticket";

/**
 * The counter's two actions, and they are shared.
 *
 * A surcharge is added from the station job aid as well as the visit screen --
 * matting is found an hour before anybody thinks about a total, and the groomer
 * holding the clipper should not have to walk to the counter terminal. Both
 * screens post here, and `returnTo` decides where they land again.
 *
 * `requireStaff()` and `requireFeature()` on every one: a server action is its
 * own endpoint and neither middleware nor a page's redirect runs for it.
 */

function back(returnTo: string, appointmentId: string, params: string): never {
  revalidatePath(`/staff/appointments/${appointmentId}`);
  revalidatePath("/staff/payments");
  // A station board shows the pet, so its page is stale too.
  if (returnTo.startsWith("/staff/stations/")) revalidatePath(returnTo);
  redirect(`${returnTo}${params}`);
}

function destination(formData: FormData, appointmentId: string): string {
  const returnTo = (formData.get("returnTo") as string | null) ?? "";
  // Only our own screens: an open redirect through a form field is not worth
  // the convenience.
  return returnTo.startsWith("/staff/") ? returnTo : `/staff/appointments/${appointmentId}`;
}

/** A fee found on the table. */
export async function addSurcharge(formData: FormData): Promise<void> {
  const staffId = await requireStaff();
  await requireFeature("featureCounterPayments");

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const returnTo = destination(formData, appointmentId);
  const surchargeId = ((formData.get("surchargeId") as string | null) ?? "").trim() || null;
  const amountCents = parseDollarsToCents(formData.get("amountCents"));
  const note = ((formData.get("note") as string | null) ?? "").trim() || null;

  if (!amountCents || amountCents <= 0) back(returnTo, appointmentId, "?error=bad_amount");

  const [appointment, surcharge] = await Promise.all([
    prisma.appointment.findUnique({ where: { id: appointmentId }, select: { id: true } }),
    surchargeId
      ? prisma.surcharge.findUnique({
          where: { id: surchargeId },
          select: { id: true, label: true, minCents: true, maxCents: true },
        })
      : null,
  ]);
  if (!appointment) redirect("/staff/appointments?error=not_found");

  // A freehand label is allowed: the published list is what the shop quotes,
  // not the only thing that can happen to a coat.
  const label =
    surcharge?.label ?? ((formData.get("label") as string | null) ?? "").trim();
  if (!label) back(returnTo, appointmentId, "?error=bad_surcharge");

  await prisma.appointmentSurcharge.create({
    data: {
      appointmentId,
      surchargeId: surcharge?.id ?? null,
      label,
      amountCents,
      // Stored, not refused. The shop's range is advisory and a genuinely
      // awful coat costs more than the price list admits.
      aboveRange: abovePublishedRange(amountCents, surcharge),
      note,
      addedById: staffId,
    },
  });

  back(returnTo, appointmentId, "?surcharged=1");
}

/** Typed in by mistake, or charged to the wrong visit. */
export async function removeSurcharge(formData: FormData): Promise<void> {
  await requireStaff();
  await requireFeature("featureCounterPayments");

  const id = (formData.get("id") as string | null) ?? "";
  const row = await prisma.appointmentSurcharge.findUnique({
    where: { id },
    select: { appointmentId: true },
  });
  if (!row) redirect("/staff/appointments?error=not_found");

  await prisma.appointmentSurcharge.delete({ where: { id } });
  back(destination(formData, row.appointmentId), row.appointmentId, "?unsurcharged=1");
}

/**
 * What the terminal took.
 *
 * `amountCents` is the whole figure handed over, tip included, because that is
 * the number on the terminal and the number Clover's batch will show. The tip
 * is recorded beside it rather than subtracted, so the two reconcile without
 * arithmetic.
 */
export async function recordPayment(formData: FormData): Promise<void> {
  const staffId = await requireStaff();
  await requireFeature("featureCounterPayments");

  const appointmentId = (formData.get("appointmentId") as string | null) ?? "";
  const returnTo = destination(formData, appointmentId);
  const methodRaw = (formData.get("method") as string | null) ?? "";
  const amountCents = parseDollarsToCents(formData.get("amountCents"));
  const tipCents = parseDollarsToCents(formData.get("tipCents")) ?? 0;
  const reference = ((formData.get("reference") as string | null) ?? "").trim() || null;
  const note = ((formData.get("note") as string | null) ?? "").trim() || null;

  // `Object.hasOwn`, never `in`: "toString" is not a payment method.
  if (!Object.hasOwn(PaymentMethod, methodRaw)) back(returnTo, appointmentId, "?error=bad_method");
  if (!amountCents || amountCents <= 0) back(returnTo, appointmentId, "?error=bad_amount");
  // A tip bigger than the payment means one of the two numbers is wrong, and
  // the counter should see that before it is written down.
  if (tipCents > amountCents) back(returnTo, appointmentId, "?error=bad_tip");

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true },
  });
  if (!appointment) redirect("/staff/appointments?error=not_found");

  await prisma.payment.create({
    data: {
      appointmentId,
      method: methodRaw as PaymentMethod,
      amountCents,
      tipCents,
      reference,
      note,
      takenById: staffId,
    },
  });

  back(returnTo, appointmentId, "?paid=1");
}

/** Keyed in wrong. A record of something that happened elsewhere is worth correcting. */
export async function removePayment(formData: FormData): Promise<void> {
  await requireStaff();
  await requireFeature("featureCounterPayments");

  const id = (formData.get("id") as string | null) ?? "";
  const row = await prisma.payment.findUnique({
    where: { id },
    select: { appointmentId: true },
  });
  if (!row) redirect("/staff/appointments?error=not_found");

  await prisma.payment.delete({ where: { id } });
  back(destination(formData, row.appointmentId), row.appointmentId, "?unpaid=1");
}
