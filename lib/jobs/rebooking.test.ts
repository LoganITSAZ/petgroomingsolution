import { describe, expect, it } from "vitest";
import { withinSendingHours } from "./rebooking";

/**
 * The shop runs on America/Phoenix and the server on UTC, so these instants
 * are written in the shop's offset deliberately: the point of the guard is
 * that it reads the shop's clock rather than the process's.
 */
describe("withinSendingHours", () => {
  it("sends at nine", () => {
    expect(withinSendingHours(new Date("2026-09-14T09:00:00-07:00"))).toBe(true);
  });

  it("does not send at five", () => {
    expect(withinSendingHours(new Date("2026-09-14T17:00:00-07:00"))).toBe(false);
  });

  it("does not send at four in the morning", () => {
    expect(withinSendingHours(new Date("2026-09-14T04:30:00-07:00"))).toBe(false);
  });

  it("reads the shop's clock, not UTC", () => {
    // Midday UTC is five in the morning in Phoenix.
    expect(withinSendingHours(new Date("2026-09-14T12:00:00Z"))).toBe(false);
  });
});
