/**
 * The scheduled job runner.
 *
 *   npx tsx scripts/jobs.ts loop          every job, forever, on its cadence
 *   npx tsx scripts/jobs.ts once          every job, one pass
 *   npx tsx scripts/jobs.ts once reminders  one job by name
 *
 * In production this is a Compose sidecar off the toolbox image. It serves no
 * requests and cannot reach the in-process SSE map in lib/station-events.ts --
 * a job that must repaint a kiosk has to go through the app instead.
 */
import { JOBS, dueJobs, type ScheduledJob } from "../lib/jobs";

const TICK_MS = 60_000;

function stamp(): string {
  return new Date().toISOString();
}

/** Run one job, reporting whatever it did. A throw is logged, never fatal. */
async function runJob(job: ScheduledJob, now: Date): Promise<void> {
  try {
    const result = await job.run(now);
    if (result.status === "skipped") {
      console.log(`${stamp()} ${job.name}: skipped — ${result.reason}`);
    } else {
      const detail = result.detail ? ` (${result.detail})` : "";
      console.log(`${stamp()} ${job.name}: acted on ${result.acted}${detail}`);
    }
  } catch (error) {
    // One job's bad day is not the loop's, and not its siblings'.
    console.error(`${stamp()} ${job.name}: failed —`, error);
  }
}

async function once(name?: string): Promise<void> {
  const jobs = name ? JOBS.filter((job) => job.name === name) : JOBS;
  if (jobs.length === 0) {
    console.error(`No such job: ${name}. Known jobs: ${JOBS.map((job) => job.name).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  const now = new Date();
  for (const job of jobs) await runJob(job, now);
}

async function loop(): Promise<void> {
  console.log(
    `${stamp()} runner up with ${JOBS.length} job(s): ${JOBS.map((job) => `${job.name}/${job.everyMins}m`).join(", ")}`
  );
  const lastRuns = new Map<string, Date>();
  // Deliberately in memory: on start every job is due, so an outage or a
  // redeploy heals itself rather than leaving a hole, and there is no run-state
  // table to keep correct. Re-running is bounded by each job's own idempotency.
  for (;;) {
    const now = new Date();
    for (const job of dueJobs(JOBS, now, lastRuns)) {
      await runJob(job, now);
      lastRuns.set(job.name, now);
    }
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
}

const [command, name] = process.argv.slice(2);
if (command === "loop") {
  loop();
} else if (command === "once") {
  once(name)
    .catch((error) => {
      console.error(`${stamp()} runner failed —`, error);
      process.exitCode = 1;
    })
    .then(() => process.exit(process.exitCode ?? 0));
} else {
  console.error("Usage: jobs.ts loop | once [job-name]");
  process.exit(1);
}
