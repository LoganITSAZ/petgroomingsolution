import { describe, expect, it } from "vitest";
import { Species } from "@prisma/client";
import {
  EXPIRING_SOON_DAYS,
  type VaccineRequirementLike,
  type VaccineRecordLike,
  checkVaccinations,
  vaccinationBlockers,
  vaccinationRefusalMessage,
  worstLevel,
} from "./vaccinations";

const RABIES: VaccineRequirementLike = { id: "rabies", name: "Rabies", species: Species.DOG };
const BORDETELLA: VaccineRequirementLike = { id: "bord", name: "Bordetella", species: Species.DOG };
const FVRCP: VaccineRequirementLike = { id: "fvrcp", name: "FVRCP", species: Species.CAT };

/** Noon in the shop's zone, so a day either way is unambiguous. */
const TODAY = new Date("2026-09-14T12:00:00-07:00");

/** A date offset from today, written as the shop would read it off a certificate. */
function day(offset: number): Date {
  return new Date(Date.UTC(2026, 8, 14 + offset, 19, 0, 0));
}

function check(
  records: VaccineRecordLike[],
  options: { requirements?: VaccineRequirementLike[]; species?: Species; graceDays?: number } = {}
) {
  return checkVaccinations({
    requirements: options.requirements ?? [RABIES],
    records,
    species: options.species ?? Species.DOG,
    today: TODAY,
    graceDays: options.graceDays ?? 0,
  });
}

describe("checkVaccinations", () => {
  it("says nothing when the shop checks nothing", () => {
    expect(check([], { requirements: [] })).toEqual([]);
  });

  it("is current with an expiry well ahead", () => {
    const [rabies] = check([{ requirementId: "rabies", expiresOn: day(400) }]);
    expect(rabies.level).toBe("current");
    expect(rabies.daysLeft).toBe(400);
    expect(rabies.blocks).toBe(false);
  });

  it("is expiring inside the warning window", () => {
    const [rabies] = check([{ requirementId: "rabies", expiresOn: day(EXPIRING_SOON_DAYS) }]);
    expect(rabies.level).toBe("expiring");
    expect(rabies.blocks).toBe(false);
  });

  it("is current one day past the warning window", () => {
    const [rabies] = check([{ requirementId: "rabies", expiresOn: day(EXPIRING_SOON_DAYS + 1) }]);
    expect(rabies.level).toBe("current");
  });

  // A certificate reading "expires 14 Sep" is good all day on the 14th.
  it("counts the expiry day itself as good", () => {
    const [rabies] = check([{ requirementId: "rabies", expiresOn: day(0) }]);
    expect(rabies.daysLeft).toBe(0);
    expect(rabies.level).toBe("expiring");
    expect(rabies.blocks).toBe(false);
  });

  it("lapses the day after the expiry, and blocks with no grace", () => {
    const [rabies] = check([{ requirementId: "rabies", expiresOn: day(-1) }]);
    expect(rabies.level).toBe("lapsed");
    expect(rabies.daysLeft).toBe(-1);
    expect(rabies.blocks).toBe(true);
  });

  // The shop saw proof and wrote no date. That is the shop's paperwork, not the
  // owner's fault, so it is flagged and never refused.
  it("flags a record with no expiry without blocking", () => {
    const [rabies] = check([{ requirementId: "rabies", expiresOn: null }]);
    expect(rabies.level).toBe("undated");
    expect(rabies.daysLeft).toBeNull();
    expect(rabies.blocks).toBe(false);
  });

  it("blocks a requirement with nothing on file", () => {
    const [rabies] = check([]);
    expect(rabies.level).toBe("missing");
    expect(rabies.blocks).toBe(true);
  });

  it("ignores requirements for another species", () => {
    const checks = check([], { requirements: [RABIES, FVRCP], species: Species.DOG });
    expect(checks.map((entry) => entry.requirementId)).toEqual(["rabies"]);
  });

  describe("grace", () => {
    it("moves what blocks, not what is shown", () => {
      const [rabies] = check([{ requirementId: "rabies", expiresOn: day(-3) }], { graceDays: 7 });
      expect(rabies.level).toBe("lapsed");
      expect(rabies.blocks).toBe(false);
    });

    it("still allows the last day of the grace", () => {
      const [rabies] = check([{ requirementId: "rabies", expiresOn: day(-7) }], { graceDays: 7 });
      expect(rabies.blocks).toBe(false);
    });

    it("blocks the day after the grace runs out", () => {
      const [rabies] = check([{ requirementId: "rabies", expiresOn: day(-8) }], { graceDays: 7 });
      expect(rabies.blocks).toBe(true);
    });

    // Grace is for a lapse. Nothing on file is not a lapse to forgive.
    it("does not forgive a missing record", () => {
      const [rabies] = check([], { graceDays: 90 });
      expect(rabies.blocks).toBe(true);
    });

    it("treats a negative grace as none", () => {
      const [rabies] = check([{ requirementId: "rabies", expiresOn: day(-1) }], { graceDays: -30 });
      expect(rabies.blocks).toBe(true);
    });
  });
});

describe("vaccinationBlockers", () => {
  it("keeps only what stands in the way", () => {
    const checks = check([{ requirementId: "rabies", expiresOn: day(-1) }], {
      requirements: [RABIES, BORDETELLA],
    });
    const blockers = vaccinationBlockers(checks);
    expect(blockers.map((entry) => entry.name)).toEqual(["Rabies", "Bordetella"]);
  });

  it("is empty for a pet that is current", () => {
    expect(vaccinationBlockers(check([{ requirementId: "rabies", expiresOn: day(400) }]))).toEqual(
      []
    );
  });
});

describe("worstLevel", () => {
  it("is null with nothing to say", () => {
    expect(worstLevel([])).toBeNull();
  });

  it("reports the worst of several", () => {
    const checks = check([{ requirementId: "bord", expiresOn: day(10) }], {
      requirements: [RABIES, BORDETELLA],
    });
    expect(worstLevel(checks)).toBe("missing");
  });

  it("ranks a lapse above an expiry and an undated record", () => {
    const checks = check(
      [
        { requirementId: "rabies", expiresOn: day(-1) },
        { requirementId: "bord", expiresOn: null },
      ],
      { requirements: [RABIES, BORDETELLA] }
    );
    expect(worstLevel(checks)).toBe("lapsed");
  });
});

describe("vaccinationRefusalMessage", () => {
  it("names every vaccine in the way", () => {
    const checks = check([], { requirements: [RABIES, BORDETELLA] });
    expect(vaccinationRefusalMessage(vaccinationBlockers(checks), "Biscuit")).toBe(
      "Biscuit is not current on Rabies, Bordetella. Bring proof of vaccination, or call the shop."
    );
  });
});
