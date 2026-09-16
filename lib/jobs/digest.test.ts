import { describe, expect, it } from "vitest";
import { digestDue } from "./digest";

const base = { lastSentOn: null, hourNow: 8, digestHour: 7, today: "2026-09-15" };

describe("digestDue", () => {
  it("sends once the shop's own clock passes the hour", () => {
    expect(digestDue(base)).toBe(true);
  });

  it("waits while it is still too early", () => {
    expect(digestDue({ ...base, hourNow: 6 })).toBe(false);
  });

  it("sends on the hour itself", () => {
    expect(digestDue({ ...base, hourNow: 7 })).toBe(true);
  });

  it("does not send twice in one shop day", () => {
    expect(digestDue({ ...base, lastSentOn: "2026-09-15" })).toBe(false);
  });

  it("sends again the next day", () => {
    expect(digestDue({ ...base, lastSentOn: "2026-09-14" })).toBe(true);
  });

  it("still sends when the runner was down at the hour itself", () => {
    // Late is worth more than never: a brief read at eleven is still the shop's
    // morning, and the day key is what stops it arriving twice.
    expect(digestDue({ ...base, hourNow: 11 })).toBe(true);
  });

  it("clamps a mis-saved hour rather than going silent", () => {
    expect(digestDue({ ...base, digestHour: 99, hourNow: 23 })).toBe(true);
    expect(digestDue({ ...base, digestHour: -5, hourNow: 0 })).toBe(true);
  });
});
