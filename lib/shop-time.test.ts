import { describe, expect, it } from "vitest";
import { shopDateTimeLocal, shopDateTimeLocalValue } from "@/lib/shop-time";

/**
 * The booking forms hand over a wall clock. Reading it with `new Date` reads it
 * in the server's zone, which is UTC in production — a nine o'clock groom would
 * be stored as two in the morning. Phoenix keeps no DST, so the offset is a flat
 * -7 all year and the assertions below can be exact.
 */
describe("shopDateTimeLocal", () => {
  it("reads a datetime-local value as shop wall clock", () => {
    expect(shopDateTimeLocal("2026-09-14T09:00")?.toISOString()).toBe("2026-09-14T16:00:00.000Z");
  });

  it("tolerates the seconds some browsers append", () => {
    expect(shopDateTimeLocal("2026-09-14T09:00:00")?.toISOString()).toBe(
      "2026-09-14T16:00:00.000Z"
    );
  });

  it("refuses anything that is not a local date-time", () => {
    expect(shopDateTimeLocal("")).toBeNull();
    expect(shopDateTimeLocal("2026-09-14")).toBeNull();
    expect(shopDateTimeLocal("tomorrow at nine")).toBeNull();
  });

  it("round-trips the value the reschedule field shows", () => {
    const at = new Date("2026-09-14T16:00:00.000Z");
    expect(shopDateTimeLocalValue(at)).toBe("2026-09-14T09:00");
    expect(shopDateTimeLocal(shopDateTimeLocalValue(at))?.getTime()).toBe(at.getTime());
  });
});
