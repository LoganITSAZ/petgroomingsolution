import { describe, expect, it } from "vitest";
import { petAge, timeSince } from "./ages";

describe("petAge", () => {
  const born = new Date("2015-06-03T00:00:00Z");

  it("turns a year older on the shop's own birthday, not the server's", () => {
    // 8 PM on 2 June in Phoenix is already 3 June in UTC.
    expect(petAge(born, new Date("2026-06-03T03:00:00Z"))).toBe("10 yr");
    expect(petAge(born, new Date("2026-06-03T19:00:00Z"))).toBe("11 yr");
  });

  it("counts a puppy in months", () => {
    expect(petAge(new Date("2026-04-20T00:00:00Z"), new Date("2026-09-24T18:00:00Z"))).toBe("5 mo");
    expect(petAge(new Date("2026-09-20T00:00:00Z"), new Date("2026-09-24T18:00:00Z"))).toBe("0 mo");
  });
});

describe("timeSince", () => {
  const now = new Date("2026-09-24T18:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);

  it("steps from days to weeks to months", () => {
    expect(timeSince(ago(0.5), now)).toBe("today");
    expect(timeSince(ago(1), now)).toBe("1 day ago");
    expect(timeSince(ago(13), now)).toBe("13 days ago");
    expect(timeSince(ago(14), now)).toBe("2 weeks ago");
    expect(timeSince(ago(69), now)).toBe("9 weeks ago");
    expect(timeSince(ago(70), now)).toBe("2 months ago");
  });
});
