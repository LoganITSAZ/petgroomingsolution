import type { ScheduledJob } from "./types";

/**
 * Which jobs are owed a run.
 *
 * Pure, with the clock and the run history passed in -- the same shape as
 * `compartmentRoom()`, and for the same reason: this is the part worth testing.
 */
export function dueJobs(
  jobs: ScheduledJob[],
  now: Date,
  lastRuns: Map<string, Date>
): ScheduledJob[] {
  return jobs.filter((job) => {
    const last = lastRuns.get(job.name);
    // Never run in this process means due. The runner keeps its history in
    // memory, so a redeploy or an outage heals itself on the next boot rather
    // than leaving a hole -- and there is no run-state table to keep correct.
    if (!last) return true;
    return now.getTime() - last.getTime() >= job.everyMins * 60_000;
  });
}
