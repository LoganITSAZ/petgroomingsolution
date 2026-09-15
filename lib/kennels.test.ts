import { describe, expect, it } from "vitest";
import { compartmentRoom, stationLimits } from "./kennels";

/**
 * The shop rule is one dog per door. The exception is a household: several
 * dogs from the same home are kennelled together on purpose, and the shop
 * reports up to five small dogs behind one door that way.
 */
describe("compartmentRoom", () => {
  const perCompartment = 1;
  const householdMax = 5;

  it("lets the first pet into an empty door", () => {
    const room = compartmentRoom([], "cust-a", perCompartment, householdMax);
    expect(room.ok).toBe(true);
    expect(room.sharedHousehold).toBe(false);
    expect(room.limit).toBe(1);
  });

  it("keeps an unrelated pet out of an occupied door", () => {
    const room = compartmentRoom(["cust-a"], "cust-b", perCompartment, householdMax);
    expect(room.ok).toBe(false);
    expect(room.limit).toBe(1);
  });

  it("lets a second pet from the same home share", () => {
    const room = compartmentRoom(["cust-a"], "cust-a", perCompartment, householdMax);
    expect(room.ok).toBe(true);
    expect(room.sharedHousehold).toBe(true);
    expect(room.limit).toBe(5);
  });

  it("stops the same home at the household limit", () => {
    const full = ["cust-a", "cust-a", "cust-a", "cust-a", "cust-a"];
    expect(compartmentRoom(full, "cust-a", perCompartment, householdMax).ok).toBe(false);
    expect(compartmentRoom(full.slice(1), "cust-a", perCompartment, householdMax).ok).toBe(true);
  });

  it("drops back to the general rule when one occupant is from another home", () => {
    const room = compartmentRoom(["cust-a", "cust-b"], "cust-a", perCompartment, householdMax);
    expect(room.ok).toBe(false);
    expect(room.sharedHousehold).toBe(false);
    expect(room.limit).toBe(1);
  });

  it("does not extend the allowance to a walk-in with no customer", () => {
    const room = compartmentRoom(["cust-a"], null, perCompartment, householdMax);
    expect(room.ok).toBe(false);
  });

  it("never lets the household limit sit below the general rule", () => {
    const room = compartmentRoom(["cust-a", "cust-a"], "cust-a", 4, 2);
    expect(room.limit).toBe(4);
    expect(room.ok).toBe(true);
  });

  it("reports how many are already inside", () => {
    expect(compartmentRoom(["cust-a", "cust-a"], "cust-a", 1, 5).inside).toBe(2);
  });
});

describe("stationLimits", () => {
  it("floors the general rule at one pet", () => {
    expect(stationLimits({
      kennelCapacityPerCompartment: 0,
      kennelHouseholdMaxPerCompartment: 0,
    })).toEqual({ perCompartment: 1, householdMax: 1 });
  });

  it("never lets the household allowance fall below the general rule", () => {
    // A household is a reason to fit more, never fewer.
    expect(stationLimits({
      kennelCapacityPerCompartment: 4,
      kennelHouseholdMaxPerCompartment: 2,
    })).toEqual({ perCompartment: 4, householdMax: 4 });
  });

  it("keeps each unit's own numbers", () => {
    expect(stationLimits({
      kennelCapacityPerCompartment: 2,
      kennelHouseholdMaxPerCompartment: 5,
    })).toEqual({ perCompartment: 2, householdMax: 5 });
  });
});
