import { NotificationKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { sendRebookingPrompt } from "@/lib/email";
import { smsRebookingPrompt } from "@/lib/sms";
import { rebookingList, type RebookingCustomer, type RebookingDue } from "@/lib/rebooking";
import { currentShopTime } from "@/lib/utils";
import type { JobResult, ScheduledJob } from "./types";

/**
 * "It has been a while." The second job on the runner.
 *
 * The arithmetic is `lib/rebooking.ts`, the same module `/staff/rebooking`
 * reads, so the list the counter works and the messages that go out can never
 * disagree about who is overdue.
 */

/** Shop-local hours the nudge may go out in. A rebooking prompt is not urgent. */
const SEND_FROM_HOUR = 9;
const SEND_TO_HOUR = 17;

/** True while the shop's own clock is inside sending hours. */
export function withinSendingHours(now: Date): boolean {
  const hour = Number(currentShopTime(now).split(":")[0]);
  return hour >= SEND_FROM_HOUR && hour < SEND_TO_HOUR;
}

async function prompt(row: RebookingDue & { customer: RebookingCustomer }): Promise<boolean> {
  const config = await getConfig();
  const channels: string[] = [];
  if (config.featureEmailNotify && row.customer.email) channels.push("EMAIL");
  if (config.featureSmsNotify && row.customer.phone && !row.customer.smsOptOut) {
    channels.push("SMS");
  }

  /*
   * Claim before send, the same trade the reminder job documents. The row is
   * anchored on the customer's last finished visit, so the unique constraint
   * reads "one prompt per completed visit" -- a customer who books after being
   * nudged earns a new anchor, and one who ignores it is not nudged again.
   *
   * A customer with no channel at all is still logged, with no channels. The
   * fact recorded is "this visit has been chased", and the shop ringing them
   * off the call list is the same fact.
   */
  try {
    await prisma.notificationLog.create({
      data: {
        appointmentId: row.lastVisitId,
        customerId: row.customerId,
        kind: NotificationKind.REBOOKING_PROMPT,
        channels,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }

  const petNames = row.customer.pets.map((pet) => pet.name);

  // Non-fatal, like every other send in the app.
  if (channels.includes("EMAIL")) {
    await sendRebookingPrompt({
      to: row.customer.email,
      ownerName: `${row.customer.firstName} ${row.customer.lastName}`,
      petNames,
      daysSince: row.daysSince,
    }).catch(console.error);
  }
  if (channels.includes("SMS")) {
    await smsRebookingPrompt({
      to: row.customer.phone,
      petNames,
      shopName: config.shopName,
      daysSince: row.daysSince,
      phone: config.shopPhone,
    }).catch(console.error);
  }
  return true;
}

export async function promptRebookings(now: Date): Promise<JobResult> {
  const config = await getConfig();
  if (!config.featureRebookingPrompts) {
    return { status: "skipped", reason: "rebooking prompts are switched off" };
  }
  if (!withinSendingHours(now)) {
    return { status: "skipped", reason: `outside sending hours (shop clock ${currentShopTime(now)})` };
  }

  const due = await rebookingList(config, now);
  const pending = due.filter((row) => !row.prompted);

  let acted = 0;
  for (const row of pending) {
    if (await prompt(row)) acted++;
  }
  return { status: "ran", acted, detail: `${due.length} overdue, ${pending.length} not yet chased` };
}

export const rebookingJob: ScheduledJob = {
  name: "rebooking",
  blurb: "Nudges a household that is past its own usual gap between grooms.",
  // Hourly: the list changes by the day, and the sending-hours window is what
  // decides when anything actually goes.
  everyMins: 60,
  run: promptRebookings,
};
