import { describe, expect, it } from "vitest";
import { AppointmentStatus } from "@prisma/client";
import { rhythmFrom, type RhythmVisit } from "./rhythm";

/**
 * The cadence arithmetic that decides who is chased, who is drifting away, and
 * what a household typically pays. Pure since the shop-wide insights started
 * batching it — before that it was only reachable through a database.
 */
const NOW = new Date("2026-09-14T12:00:00-07:00");
const DAY = 86_400_000;

function visit(daysAgo: number, overrides: Partial<RhythmVisit> = {}): RhythmVisit {
  return {
    scheduledAt: new Date(NOW.getTime() - daysAgo * DAY),
    status: AppointmentStatus.PICKED_UP,
    pricingDiscountCents: 0,
    services: [{ priceCents: 6000 }],
    ...overrides,
  };
}

describe("rhythmFrom", () => {
  it("says nothing about cadence from too few visits", () => {
    const rhythm = rhythmFrom([visit(80), visit(40)], 0, 0, NOW);
    expect(rhythm.cadenceDays).toBeNull();
    expect(rhythm.dueForRebooking).toBe(false);
  });

  it("takes the median gap, so one long absence is not the habit", () => {
    const rhythm = rhythmFrom([visit(400), visit(100), visit(70), visit(40)], 0, 0, NOW);
    expect(rhythm.cadenceDays).toBe(30);
  });

  it("orders history itself rather than trusting the caller", () => {
    const rhythm = rhythmFrom([visit(40), visit(100), visit(70)], 0, 0, NOW);
    expect(rhythm.cadenceDays).toBe(30);
    expect(rhythm.daysSinceLastVisit).toBe(40);
  });

  it("is not due while something is on the books", () => {
    const history = [visit(100), visit(70), visit(40)];
    expect(rhythmFrom(history, 0, 0, NOW).dueForRebooking).toBe(true);
    expect(rhythmFrom(history, 1, 0, NOW).dueForRebooking).toBe(false);
  });

  it("holds the due date back by the shop's grace period", () => {
    const history = [visit(95), visit(65), visit(35)];
    expect(rhythmFrom(history, 0, 0, NOW).dueForRebooking).toBe(true);
    expect(rhythmFrom(history, 0, 10, NOW).dueForRebooking).toBe(false);
  });

  it("calls double the usual gap a customer drifting away", () => {
    const lapsed = rhythmFrom([visit(160), visit(130), visit(100)], 0, 0, NOW);
    expect(lapsed.lapsing).toBe(true);
    expect(lapsed.dueForRebooking).toBe(true);
  });

  it("counts no-shows without letting them set the cadence", () => {
    const history = [
      visit(100),
      visit(85, { status: AppointmentStatus.NO_SHOW }),
      visit(70),
      visit(40),
    ];
    const rhythm = rhythmFrom(history, 0, 0, NOW);
    expect(rhythm.visits).toBe(3);
    expect(rhythm.noShows).toBe(1);
    expect(rhythm.noShowRate).toBe(0.25);
    expect(rhythm.cadenceDays).toBe(30);
  });

  it("nets the typical ticket of what an agreed rate took off", () => {
    const rhythm = rhythmFrom(
      [visit(100, { pricingDiscountCents: 1000 }), visit(70, { pricingDiscountCents: 1000 })],
      0,
      0,
      NOW
    );
    expect(rhythm.averageTicketCents).toBe(5000);
  });

  it("never reports a negative ticket from an over-large discount", () => {
    const rhythm = rhythmFrom([visit(50, { pricingDiscountCents: 999_999 })], 0, 0, NOW);
    expect(rhythm.averageTicketCents).toBe(0);
  });

  it("handles a household with no history at all", () => {
    const rhythm = rhythmFrom([], 0, 0, NOW);
    expect(rhythm.visits).toBe(0);
    expect(rhythm.cadenceDays).toBeNull();
    expect(rhythm.noShowRate).toBe(0);
    expect(rhythm.averageTicketCents).toBeNull();
  });
});
