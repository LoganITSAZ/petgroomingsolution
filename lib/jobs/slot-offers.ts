import { AppointmentStatus, NotificationKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { sendSlotOffer } from "@/lib/email";
import { isEnabled } from "@/lib/features";
import { rhythmsFor } from "@/lib/rhythm";
import { smsSlotOffer } from "@/lib/sms";
import { currentShopTime, formatShopDate, formatShopTime } from "@/lib/utils";
import type { JobResult, ScheduledJob } from "./types";

/**
 * A cancellation is a hole in Thursday. The fourth job on the runner.
 *
 * The shop already knows two things it never puts together: that Thursday at
 * ten just came free, and that eleven households are about due by their own
 * habit. Somebody ringing round the call list is doing this by hand; this is
 * the same call, made before the day arrives.
 *
 * It offers, it never books. There is no inbound webhook in this app — a text
 * reply needs a public callback URL and signature verification — so the message
 * says a slot opened and to ring the shop, and the counter takes it from there.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shop-local hours an offer may go out in. Same manners as the rebooking nudge. */
const SEND_FROM_HOUR = 9;
const SEND_TO_HOUR = 17;

export interface SlotCandidate {
  customerId: string;
  /** When their own cadence says they are next due. */
  dueAt: Date;
  /** Days between that and the free slot, either side of it. */
  daysApart: number;
}

/**
 * Who is worth ringing about one free slot, best first.
 *
 * Pure, because the judgement is the whole feature: offering a Thursday to a
 * household that came in last week is the shop pestering its own customers.
 * A household already past due is included and scores well — the gap is
 * measured either side of the slot, so "due a week ago" and "due in a week"
 * are equally near, which is how a counter thinks about it.
 */
export function rankForSlot(
  rhythms: Map<string, { cadenceDays: number | null; lastVisit: Date | null; hasUpcoming: boolean }>,
  slotAt: Date,
  windowDays: number,
  max: number
): SlotCandidate[] {
  const window = Math.max(0, Math.floor(windowDays));
  const candidates: SlotCandidate[] = [];

  for (const [customerId, rhythm] of rhythms) {
    if (rhythm.hasUpcoming) continue; // Already in the diary; they do not need a second slot.
    if (rhythm.cadenceDays == null || rhythm.lastVisit == null) continue;
    const dueAt = new Date(rhythm.lastVisit.getTime() + rhythm.cadenceDays * DAY_MS);
    const daysApart = Math.round(Math.abs(slotAt.getTime() - dueAt.getTime()) / DAY_MS);
    if (daysApart > window) continue;
    candidates.push({ customerId, dueAt, daysApart });
  }

  // Nearest their own date first, then the longest-waiting, so a tie does not
  // depend on the order the customer rows came back in.
  candidates.sort(
    (a, b) => a.daysApart - b.daysApart || a.dueAt.getTime() - b.dueAt.getTime()
  );
  return candidates.slice(0, Math.max(0, Math.floor(max)));
}

/** True while the shop's own clock is inside sending hours. */
export function withinOfferHours(now: Date): boolean {
  const hour = Number(currentShopTime(now).split(":")[0]);
  return hour >= SEND_FROM_HOUR && hour < SEND_TO_HOUR;
}

type Household = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  smsOptOut: boolean;
  pets: { name: string }[];
};

async function offer(slot: { id: string; scheduledAt: Date }, customer: Household): Promise<boolean> {
  const config = await getConfig();
  const channels: string[] = [];
  if (config.featureEmailNotify && customer.email) channels.push("EMAIL");
  if (config.featureSmsNotify && customer.phone && !customer.smsOptOut) channels.push("SMS");
  if (channels.length === 0) return false; // Nothing to send; do not burn the claim.

  /*
   * Claim before send, the same trade the reminder job documents. The unique
   * key is [appointmentId, customerId, kind], so one household is offered one
   * cancelled slot exactly once however many times the runner ticks.
   */
  try {
    await prisma.notificationLog.create({
      data: {
        appointmentId: slot.id,
        customerId: customer.id,
        kind: NotificationKind.SLOT_OFFER,
        channels,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }

  const petNames = customer.pets.map((pet) => pet.name);
  const when = `${formatShopDate(slot.scheduledAt, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })} at ${formatShopTime(slot.scheduledAt)}`;

  // Non-fatal, like every other send in the app.
  if (channels.includes("EMAIL") && customer.email) {
    await sendSlotOffer({
      to: customer.email,
      ownerName: `${customer.firstName} ${customer.lastName}`,
      petNames,
      when,
    }).catch(console.error);
  }
  if (channels.includes("SMS")) {
    await smsSlotOffer({
      to: customer.phone,
      petNames,
      shopName: config.shopName,
      when,
      phone: config.shopPhone,
    }).catch(console.error);
  }
  return true;
}

export async function offerCancelledSlots(now: Date = new Date()): Promise<JobResult> {
  const config = await getConfig();
  if (!isEnabled(config, "featureSlotOffers")) {
    return { status: "skipped", reason: "filling cancelled slots is switched off" };
  }
  if (!withinOfferHours(now)) {
    return { status: "skipped", reason: `outside sending hours (shop clock ${currentShopTime(now)})` };
  }

  /*
   * A slot is only worth offering while somebody could still take it: past the
   * shop's own lead time, and inside the window the offer is matched against.
   * Anything sooner than the lead time is the counter's phone call, not a job's.
   */
  const earliest = new Date(now.getTime() + config.bookingLeadHours * 60 * 60 * 1000);
  const latest = new Date(now.getTime() + config.slotOfferWindowDays * DAY_MS);

  const slots = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.CANCELLED,
      scheduledAt: { gte: earliest, lte: latest },
    },
    select: { id: true, scheduledAt: true },
    orderBy: { scheduledAt: "asc" },
  });
  if (slots.length === 0) return { status: "ran", acted: 0, detail: "no free slots to offer" };

  const customers = await prisma.customer.findMany({
    where: { isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      smsOptOut: true,
      pets: { where: { isActive: true }, select: { name: true } },
    },
  });
  const rhythms = await rhythmsFor(
    customers.map((customer) => customer.id),
    config.rebookingGraceDays,
    now
  );
  const byId = new Map(customers.map((customer) => [customer.id, customer]));

  /*
   * One household is offered one slot per run. Two cancellations on the same
   * morning would otherwise both land on the same best-matched customer, and
   * two texts about two slots is the shop sounding desperate rather than
   * helpful.
   */
  const offeredThisRun = new Set<string>();
  let acted = 0;

  for (const slot of slots) {
    const ranked = rankForSlot(
      rhythms,
      slot.scheduledAt,
      config.slotOfferWindowDays,
      config.slotOfferMaxRecipients
    );
    for (const candidate of ranked) {
      if (offeredThisRun.has(candidate.customerId)) continue;
      const customer = byId.get(candidate.customerId);
      if (!customer) continue;
      if (await offer(slot, customer)) {
        offeredThisRun.add(candidate.customerId);
        acted++;
      }
    }
  }

  return { status: "ran", acted, detail: `${slots.length} free slots in the window` };
}

export const slotOfferJob: ScheduledJob = {
  name: "slot-offers",
  blurb: "Tells households who are about due that a cancelled slot came free.",
  // Hourly: a cancellation is worth acting on the same day, and the sending
  // hours are what decide when anything actually goes.
  everyMins: 60,
  run: offerCancelledSlots,
};
