import { describe, expect, it } from "vitest";
import { StationRole } from "@prisma/client";
import { WORK_STATION_ROLES, isWorkStation, nextStationName, stationCapacity } from "./stations";

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

describe("WORK_STATION_ROLES", () => {
  it("is where a pet can stand, so a kennel and a register are not in it", () => {
    expect(WORK_STATION_ROLES).toEqual([
      StationRole.GROOMER,
      StationRole.BATHING,
      StationRole.DRYING,
    ]);
    expect(isWorkStation(StationRole.REGISTER)).toBe(false);
    expect(isWorkStation(StationRole.KENNEL)).toBe(false);
    expect(isWorkStation(StationRole.GROOMER)).toBe(true);
  });

  it("covers every role in the enum, so a new one is a decision rather than a default", () => {
    const accounted = [...WORK_STATION_ROLES, StationRole.KENNEL, StationRole.REGISTER];
    expect(new Set(accounted).size).toBe(Object.values(StationRole).length);
  });

  it("gives a register no capacity — no pet ever stands at one", () => {
    expect(stationCapacity({ role: StationRole.REGISTER })).toBe(0);
  });
});
