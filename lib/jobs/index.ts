import { reminderJob } from "./reminders";
import type { ScheduledJob } from "./types";

/** Every scheduled job, declared once — the same rule as the feature registry. */
export const JOBS: ScheduledJob[] = [reminderJob];

export { dueJobs } from "./schedule";
export type { JobResult, ScheduledJob } from "./types";
