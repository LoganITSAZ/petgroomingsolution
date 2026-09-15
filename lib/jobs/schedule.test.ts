import { describe, expect, it } from "vitest";
import { dueJobs } from "./schedule";
import type { ScheduledJob } from "./types";

const job = (name: string, everyMins: number): ScheduledJob => ({
  name,
  blurb: "test",
  everyMins,
  run: async () => ({ status: "ran", acted: 0 }),
});

const NOW = new Date("2026-09-14T09:00:00Z");

describe("dueJobs", () => {
  // The runner keeps its history in memory, so a redeploy heals the hole it
  // left rather than waiting out the cadence.
  it("owes every job a run on a fresh start", () => {
    const jobs = [job("a", 15), job("b", 1440)];
    expect(dueJobs(jobs, NOW, new Map()).map((entry) => entry.name)).toEqual(["a", "b"]);
  });

  it("leaves a job alone inside its cadence", () => {
    const lastRuns = new Map([["a", new Date(NOW.getTime() - 5 * 60_000)]]);
    expect(dueJobs([job("a", 15)], NOW, lastRuns)).toEqual([]);
  });

  it("owes a job past its cadence", () => {
    const lastRuns = new Map([["a", new Date(NOW.getTime() - 16 * 60_000)]]);
    expect(dueJobs([job("a", 15)], NOW, lastRuns)).toHaveLength(1);
  });

  it("owes a job exactly on its cadence", () => {
    const lastRuns = new Map([["a", new Date(NOW.getTime() - 15 * 60_000)]]);
    expect(dueJobs([job("a", 15)], NOW, lastRuns)).toHaveLength(1);
  });

  it("judges each job on its own last run", () => {
    const lastRuns = new Map([
      ["a", new Date(NOW.getTime() - 60 * 60_000)],
      ["b", new Date(NOW.getTime() - 60 * 60_000)],
    ]);
    const due = dueJobs([job("a", 15), job("b", 1440)], NOW, lastRuns);
    expect(due.map((entry) => entry.name)).toEqual(["a"]);
  });
});
