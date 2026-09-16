import { digestJob } from "./digest";
import { rebookingJob } from "./rebooking";
import { reminderJob } from "./reminders";
import { slotOfferJob } from "./slot-offers";
import type { ScheduledJob } from "./types";

/** Every scheduled job, declared once — the same rule as the feature registry. */
export const JOBS: ScheduledJob[] = [reminderJob, rebookingJob, digestJob, slotOfferJob];

export { dueJobs } from "./schedule";
export type { JobResult, ScheduledJob } from "./types";
