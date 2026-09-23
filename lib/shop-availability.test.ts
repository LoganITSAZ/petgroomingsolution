import { describe, expect, it } from "vitest";
import { shopAvailability, weeklyAvailability } from "./shop-availability";

const config = {
  businessHours: {
    monday: { open: "08:00", close: "15:00" },
    tuesday: { open: "08:00", close: "17:00" },
    sunday: null,
  },
  featureWalkInPortal: true,
  walkInWindowStart: "09:00",
  walkInWindowEnd: "16:00",
};
const status = (iso: string, overrides = {}) => shopAvailability({ ...config, ...overrides }, new Date(iso));

describe("scheduled public availability", () => {
  it("opens before the walk-in window without accepting walk-ins", () => {
    const value = status("2026-09-15T15:00:00Z"); // Tue 8am Phoenix
    expect(value.shop?.open).toBe(true);
    expect(value.acceptingWalkIns).toBe(false);
  });
  it("accepts walk-ins at the start of the window", () => {
    expect(status("2026-09-15T16:00:00Z").acceptingWalkIns).toBe(true);
  });
  it("stops walk-ins exactly at the cutoff while the shop remains open", () => {
    const value = status("2026-09-15T23:00:00Z");
    expect(value.shop?.open).toBe(true);
    expect(value.acceptingWalkIns).toBe(false);
  });
  it("stops at an earlier shop closing time", () => {
    const value = status("2026-09-14T22:00:00Z"); // Mon 3pm Phoenix
    expect(value.shop?.open).toBe(false);
    expect(value.acceptingWalkIns).toBe(false);
  });
  it("does not accept walk-ins on closed days even inside the window", () => {
    expect(status("2026-09-13T18:00:00Z").acceptingWalkIns).toBe(false);
  });
  it("honors disabled walk-ins and missing or invalid schedules", () => {
    const now = "2026-09-15T18:00:00Z";
    for (const overrides of [
      { featureWalkInPortal: false }, { businessHours: {} },
      { walkInWindowStart: "" }, { walkInWindowEnd: "25:00" },
      { walkInWindowStart: "16:00", walkInWindowEnd: "09:00" },
    ]) expect(status(now, overrides).acceptingWalkIns).toBe(false);
  });
  it("reflects a changed schedule with the same current time", () => {
    const now = "2026-09-15T18:00:00Z";
    expect(status(now).acceptingWalkIns).toBe(true);
    expect(status(now, { businessHours: { tuesday: null } }).acceptingWalkIns).toBe(false);
  });
});

describe("weekly walk-in hours", () => {
  it("caps each window at the shop closing time and marks closed days unavailable", () => {
    const rows = weeklyAvailability(config);
    expect(rows[0]).toMatchObject({ days: "Mon", hours: "8am – 3pm", walkIns: "9am – 3pm" });
    expect(rows[1]).toMatchObject({ days: "Tue", hours: "8am – 5pm", walkIns: "9am – 4pm" });
    expect(rows[2]).toMatchObject({ days: "Wed – Sun", hours: "Closed", walkIns: "Unavailable" });
  });
  it("does not publish a walk-in window when disabled or outside shop hours", () => {
    expect(weeklyAvailability({ ...config, featureWalkInPortal: false }).every(row => row.walkIns === "Unavailable")).toBe(true);
    expect(weeklyAvailability({ ...config, walkInWindowStart: "18:00", walkInWindowEnd: "19:00" }).every(row => row.walkIns === "Unavailable")).toBe(true);
  });
});
