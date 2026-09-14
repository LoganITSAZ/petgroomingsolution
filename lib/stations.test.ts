import { describe, expect, it } from "vitest";
import { StationRole } from "@prisma/client";
import { nextStationName } from "./stations";

describe("nextStationName", () => {
  it("names the first station of a role", () => {
    expect(nextStationName(StationRole.DRYING, [])).toBe("Dryer 1");
  });

  it("counts past what is already on file", () => {
    expect(nextStationName(StationRole.GROOMER, ["Grooming Table 1", "Grooming Table 2"])).toBe(
      "Grooming Table 3"
    );
  });

  it("fills a hole left by a removed station", () => {
    expect(nextStationName(StationRole.BATHING, ["Bath 1", "Bath 3"])).toBe("Bath 2");
  });

  it("ignores names the shop typed itself", () => {
    expect(nextStationName(StationRole.KENNEL, ["Back Room"])).toBe("Kennel Bank 1");
  });
});
