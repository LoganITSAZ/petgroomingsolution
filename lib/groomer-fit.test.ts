import { describe, expect, it } from "vitest";
import {
  bookingGroomer,
  errorCauses,
  errorGate,
  fitStats,
  foldRedoMins,
  speedWinner,
  usualGroomer,
  type FitQuestion,
  type FitSample,
} from "./groomer-fit";

const T0 = new Date("2026-06-01T15:00:00Z");
const at = (mins: number) => new Date(T0.getTime() + mins * 60_000);
let seq = 0;

function sample(over: Partial<FitSample> = {}): FitSample {
  seq += 1;
  return {
    appointmentId: `a${seq}`,
    staffId: "sam",
    petId: "bella",
    guideId: "doodle",
    guideName: "Goldendoodle",
    serviceType: "FULL_GROOM",
    sizeTier: "LARGE",
    coatType: "CURLY",
    finishedAt: new Date(T0.getTime() + seq * 86_400_000),
    workedMins: 60,
    errors: [],
    ...over,
  };
}
const many = (count: number, over: Partial<FitSample> = {}) =>
  Array.from({ length: count }, () => sample(over));

const STAFF = [
  { id: "sam", name: "Sam" },
  { id: "ana", name: "Ana" },
];
function question(over: Partial<FitQuestion> = {}): FitQuestion {
  return {
    petId: "bella",
    guideId: "doodle",
    serviceType: "FULL_GROOM",
    preferredStaffId: null,
    candidates: STAFF,
    ...over,
  };
}

describe("errorCauses", () => {
  const flow = (...statuses: string[]) =>
    statuses.map((status, index) => ({ status, changedAt: at(index * 10) }));

  it("counts each error event once, and a linked redo", () => {
    expect(
      errorCauses({ eventTypes: ["COMPLAINT", "COMPLAINT", "INJURY"], history: [], redoVisits: 1 }).sort()
    ).toEqual(["COMPLAINT", "INJURY", "REDO_VISIT"]);
    expect(errorCauses({ eventTypes: ["REDO", "BITE", "BEHAVIORAL"], history: [], redoVisits: 0 }).sort()).toEqual([
      "BEHAVIORAL",
      "BITE",
      "REDO",
    ]);
  });

  it("does not count what is not the groomer's doing", () => {
    expect(
      errorCauses({ eventTypes: ["REWASH", "MATTING_FOUND", "EQUIPMENT_ISSUE", "HEALTH_FINDING", "OTHER"], history: [], redoVisits: 0 })
    ).toEqual([]);
  });

  it("counts a pet sent back a stage", () => {
    const history = flow("CHECKED_IN", "IN_PROGRESS", "DRYING", "FINISHING", "IN_PROGRESS", "FINISHING", "COMPLETE");
    expect(errorCauses({ eventTypes: [], history, redoVisits: 0 })).toEqual(["SENT_BACK"]);
  });

  it("lets a logged rewash explain the backward move", () => {
    const history = flow("CHECKED_IN", "IN_PROGRESS", "DRYING", "IN_PROGRESS", "DRYING", "COMPLETE");
    expect(errorCauses({ eventTypes: ["REWASH"], history, redoVisits: 0 })).toEqual([]);
  });

  it("reads the history in time order, not row order", () => {
    const history = [
      { status: "COMPLETE", changedAt: at(30) },
      { status: "CHECKED_IN", changedAt: at(0) },
      { status: "FINISHING", changedAt: at(20) },
    ];
    expect(errorCauses({ eventTypes: [], history, redoVisits: 0 })).toEqual([]);
  });
});

describe("foldRedoMins", () => {
  it("adds a redo's minutes to the original", () => {
    expect(foldRedoMins(60, [25])).toBe(85);
  });
  it("treats an unmeasured redo as nothing, and an unmeasured original as unmeasured", () => {
    expect(foldRedoMins(60, [null])).toBe(60);
    expect(foldRedoMins(null, [25])).toBeNull();
  });
});

describe("errorGate", () => {
  const shop = fitStats([...many(95), ...many(5, { errors: ["COMPLAINT"] })]); // 5%

  it("never gates on one error", () => {
    expect(errorGate(fitStats([...many(2), sample({ errors: ["BITE"] })]), shop)).toBe(false);
  });
  it("needs 2x the shop rate", () => {
    const high = fitStats([...many(80), ...many(20, { errors: ["COMPLAINT"] })]); // 20%
    expect(errorGate(fitStats([...many(18), ...many(2, { errors: ["INJURY"] })]), high)).toBe(false); // 10% < 40%
  });
  it("needs 10 points over the shop rate", () => {
    const low = fitStats([...many(97), ...many(3, { errors: ["COMPLAINT"] })]); // 3%
    expect(errorGate(fitStats([...many(23), ...many(2, { errors: ["INJURY"] })]), low)).toBe(false); // 8%: 2.7x but +5
  });
  it("gates when all three hold", () => {
    expect(errorGate(fitStats([...many(6), ...many(2, { errors: ["INJURY"] })]), shop)).toBe(true); // 25%
  });
  it("works against a shop rate of zero", () => {
    expect(errorGate(fitStats([...many(3), ...many(2, { errors: ["BITE"] })]), fitStats(many(50)))).toBe(true);
  });
  it("never gates under 3 visits, or with no baseline", () => {
    expect(errorGate(fitStats(many(2, { errors: ["BITE"] })), shop)).toBe(false);
    expect(errorGate(fitStats(many(5, { errors: ["BITE"] })), null)).toBe(false);
  });
});

describe("speedWinner", () => {
  const entry = (staffId: string, mins: number[]) => ({
    staffId,
    stats: fitStats(mins.map((workedMins) => sample({ staffId, workedMins }))),
  });

  it("needs both 15% and 10 minutes", () => {
    expect(speedWinner([entry("sam", [32, 32, 32]), entry("ana", [40, 40, 40])])).toBeNull(); // 20%, 8 min
    expect(speedWinner([entry("sam", [108, 108, 108]), entry("ana", [120, 120, 120])])).toBeNull(); // 12 min, 10%
    expect(speedWinner([entry("sam", [52, 52, 52]), entry("ana", [71, 71, 71])])).toMatchObject({
      staffId: "sam",
      mins: 52,
      otherMins: 71,
    });
  });
  it("needs 3 measured visits each, and a second groomer", () => {
    expect(speedWinner([entry("sam", [40, 40]), entry("ana", [90, 90, 90])])).toBeNull();
    expect(speedWinner([entry("sam", [40, 40, 40])])).toBeNull();
  });
  it("counts an unmeasured visit toward errors, not speed", () => {
    const stats = fitStats([sample({ workedMins: null, errors: ["BITE"] }), sample({ workedMins: 50 })]);
    expect(stats).toMatchObject({ visits: 2, errorVisits: 1, measured: 1, medianMins: 50 });
  });
});

describe("usualGroomer", () => {
  it("takes whoever did most of the last five", () => {
    const visits = [...many(3, { staffId: "ana" }), ...many(2, { staffId: "sam" })];
    expect(usualGroomer(visits)).toEqual({ staffId: "ana", count: 3, of: 5 });
  });
  it("only reads the last five", () => {
    const visits = [...many(4, { staffId: "ana" }), ...many(5, { staffId: "sam" })];
    expect(usualGroomer(visits)).toEqual({ staffId: "sam", count: 5, of: 5 });
  });
  it("breaks a tie toward the most recent", () => {
    const visits = [sample({ staffId: "ana" }), sample({ staffId: "sam" })];
    expect(usualGroomer(visits)).toEqual({ staffId: "sam", count: 1, of: 2 });
  });
  it("is null with no history", () => {
    expect(usualGroomer([])).toBeNull();
  });
});

describe("bookingGroomer", () => {
  it("picks the faster groomer on the breed over the owner's preference", () => {
    const samples = [...many(4, { staffId: "ana", workedMins: 52, petId: "x" }), ...many(6, { staffId: "sam", workedMins: 71, petId: "y" })];
    expect(bookingGroomer(question({ preferredStaffId: "sam" }), samples)).toEqual({
      staffId: "ana",
      staffName: "Ana",
      reason: "faster on this breed: 52 vs 71 min over 4 and 6 visits",
    });
  });

  it("uses the pet's own history when two groomers have 3 visits on it", () => {
    const samples = [
      ...many(3, { staffId: "ana", workedMins: 90 }),
      ...many(3, { staffId: "sam", workedMins: 60 }),
      // On other Doodles Ana is the faster one; the pet level must win.
      ...many(10, { staffId: "ana", workedMins: 40, petId: "other" }),
    ];
    expect(bookingGroomer(question(), samples)?.reason).toBe("faster on this pet: 60 vs 90 min over 3 and 3 visits");
  });

  it("falls back to the preference, then the usual groomer, then nobody", () => {
    expect(bookingGroomer(question({ preferredStaffId: "sam" }), [])).toMatchObject({ staffId: "sam", reason: "owner's preference" });
    const history = many(4, { staffId: "ana", petId: "bella", guideId: null });
    expect(bookingGroomer(question({ guideId: null }), history)).toMatchObject({ staffId: "ana", reason: "groomed 4 of last 4" });
    expect(bookingGroomer(question(), [])).toBeNull();
  });

  it("skips a preference who is not a candidate", () => {
    const history = many(2, { staffId: "ana" });
    expect(bookingGroomer(question({ preferredStaffId: "gone" }), history)).toMatchObject({ staffId: "ana" });
  });

  it("skips a gated preference and says why", () => {
    const samples = [
      ...many(3, { staffId: "sam", petId: "y" }),
      ...many(2, { staffId: "sam", petId: "y", errors: ["COMPLAINT"] }),
      ...many(40, { staffId: "ana", petId: "z" }),
      ...many(2, { staffId: "ana", petId: "bella" }),
    ];
    const pick = bookingGroomer(question({ preferredStaffId: "sam" }), samples);
    expect(pick?.staffId).toBe("ana");
    expect(pick?.reason).toBe("Sam skipped: 2 of 5 visits had an error, shop 4%; groomed 2 of last 2");
  });

  it("makes no breed claim without a guide, but still honours the preference", () => {
    const samples = [...many(4, { staffId: "ana", workedMins: 30, guideId: null, petId: "x" }), ...many(4, { staffId: "sam", workedMins: 90, guideId: null, petId: "y" })];
    expect(bookingGroomer(question({ guideId: null, preferredStaffId: "sam" }), samples)).toMatchObject({
      staffId: "sam",
      reason: "owner's preference",
    });
  });
});
