/**
 * What a scheduled job is.
 *
 * Every side effect in this app hangs off a request -- a status change, a form
 * save, a page render. A reminder the day before a visit has no request behind
 * it, so it needs something that runs when nobody is looking at a screen.
 *
 * `run()` takes `now` rather than reading the clock, so a test can place a job
 * anywhere in time without mocking a module.
 */

export type JobResult =
  | { status: "skipped"; reason: string }
  | { status: "ran"; acted: number; detail?: string };

export interface ScheduledJob {
  /** Stable name: the CLI takes it, and the log lines carry it. */
  name: string;
  /** One line for the log and for whoever reads this file next. */
  blurb: string;
  everyMins: number;
  run(now: Date): Promise<JobResult>;
}
