import { AppointmentStatus, NotificationKind, Prisma, type SystemConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { sendAppointmentReminder } from "@/lib/email";
import { smsAppointmentReminder } from "@/lib/sms";
import { formatShopDate, formatShopTime } from "@/lib/utils";
import type { JobResult, ScheduledJob } from "./types";

/**
 * "Your dog is booked in tomorrow."
 *
 * The shop measures no-shows in `lib/insights.ts` and has been able to do
 * nothing about them, because nothing in the app runs at a time when nobody is
 * looking at a screen. This is the first job on the runner.
 */

export interface RemindableVisit {
  id: string;
  scheduledAt: Date;
  status: AppointmentStatus;
  /** Whether a reminder has already been logged for this visit. */
  reminded: boolean;
}

export interface ReminderWindow {
  reminderHoursBefore: number;
  bookingLeadHours: number;
}

/**
 * Which of these visits are owed a reminder.
 *
 * Pure so the edges are testable: the window's far end, the lead-hours floor,
 * a visit already reminded, and a visit that has moved on from `SCHEDULED`.
 */
export function selectVisitsToRemind<T extends RemindableVisit>(
  visits: T[],
  window: ReminderWindow,
  now: Date
): T[] {
  const hoursAhead = Math.max(1, Math.floor(window.reminderHoursBefore));
  // A visit inside the shop's own booking lead time is noise: the owner is
  // already on their way. Late is fine -- the runner may have been down, and
  // the customer still wants to know.
  const floorMs = now.getTime() + Math.max(0, window.bookingLeadHours) * 3_600_000;
  const ceilingMs = now.getTime() + hoursAhead * 3_600_000;

  return visits.filter((visit) => {
    // The status filter alone excludes cancelled, no-show, and pets already in
    // the shop -- none of which want a reminder about turning up.
    if (visit.status !== AppointmentStatus.SCHEDULED) return false;
    if (visit.reminded) return false;
    const at = visit.scheduledAt.getTime();
    return at > floorMs && at <= ceilingMs;
  });
}

export interface ReminderChannelConfig {
  featureEmailNotify: boolean;
  featureSmsNotify: boolean;
}

export interface Remindable {
  email: string | null;
  phone: string | null;
  smsOptOut: boolean;
}

/**
 * Which channels this reminder can actually go down.
 *
 * The same rules every other send in the app follows: email when the shop
 * mails customers and it has an address, SMS when texts are live, there is a
 * number, and the customer has not opted out.
 */
export function reminderChannels(config: ReminderChannelConfig, customer: Remindable): string[] {
  const channels: string[] = [];
  if (config.featureEmailNotify && customer.email) channels.push("EMAIL");
  if (config.featureSmsNotify && customer.phone && !customer.smsOptOut) channels.push("SMS");
  return channels;
}

/** One visit's reminder, on whichever channels the shop has switched on. */
async function remind(
  visit: {
    id: string;
    customerId: string;
    scheduledAt: Date;
    pet: { name: string };
    customer: { firstName: string; lastName: string; email: string; phone: string | null; smsOptOut: boolean };
  },
  config: SystemConfig
): Promise<boolean> {
  const channels = reminderChannels(config, visit.customer);
  // Nothing to send it down, so nothing is claimed. Writing the row anyway
  // would mark the visit reminded for good, and the reminder the shop switches
  // email back on for would never go.
  if (channels.length === 0) return false;

  /*
   * Claim before send. A crash between the two loses one reminder; the other
   * ordering sends it twice, and a duplicate text at seven in the morning is
   * what a shop gets a phone call about.
   *
   * The unique constraint is the real guard rather than the single-runner
   * assumption: two runners racing produce one winner and one P2002, which is
   * "already sent" rather than an error.
   *
   * ponytail: no outbox, so a crash between the claim and the send drops that
   * one reminder. A `NotificationLog.status` column and a retry pass is the
   * upgrade if that is ever worth more than the duplicate it prevents.
   */
  try {
    await prisma.notificationLog.create({
      data: {
        appointmentId: visit.id,
        customerId: visit.customerId,
        kind: NotificationKind.APPOINTMENT_REMINDER,
        channels,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }

  const when = `${formatShopDate(visit.scheduledAt)} at ${formatShopTime(visit.scheduledAt)}`;

  // Non-fatal, like every other send in the app: a carrier outage must not
  // stop the rest of the batch.
  if (channels.includes("EMAIL")) {
    await sendAppointmentReminder({
      to: visit.customer.email,
      ownerName: `${visit.customer.firstName} ${visit.customer.lastName}`,
      petName: visit.pet.name,
      scheduledAt: visit.scheduledAt,
    }).catch(console.error);
  }
  if (channels.includes("SMS")) {
    await smsAppointmentReminder({
      to: visit.customer.phone,
      petName: visit.pet.name,
      shopName: config.shopName,
      when,
      phone: config.shopPhone,
    }).catch(console.error);
  }
  return true;
}

export async function remindUpcomingVisits(now: Date): Promise<JobResult> {
  const config = await getConfig();
  if (!config.featureAppointmentReminders) {
    return { status: "skipped", reason: "reminders are switched off" };
  }

  const hoursAhead = Math.max(1, Math.floor(config.reminderHoursBefore));
  const visits = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: { gt: now, lte: new Date(now.getTime() + hoursAhead * 3_600_000) },
      notifications: { none: { kind: NotificationKind.APPOINTMENT_REMINDER } },
    },
    select: {
      id: true,
      customerId: true,
      scheduledAt: true,
      status: true,
      pet: { select: { name: true } },
      customer: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          smsOptOut: true,
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // The query narrows; this decides. Both edges of the window live in the pure
  // function so they are tested rather than trusted.
  const due = selectVisitsToRemind(
    visits.map((visit) => ({ ...visit, reminded: false })),
    { reminderHoursBefore: hoursAhead, bookingLeadHours: config.bookingLeadHours },
    now
  );

  let acted = 0;
  for (const visit of due) {
    if (await remind(visit, config)) acted++;
  }
  return { status: "ran", acted, detail: `${due.length} due` };
}

export const reminderJob: ScheduledJob = {
  name: "reminders",
  blurb: "Reminds a customer their visit is coming up.",
  // The window is hours wide, so a quarter-hour cadence is well inside it.
  everyMins: 15,
  run: remindUpcomingVisits,
};
