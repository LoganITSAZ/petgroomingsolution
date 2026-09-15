import { describe, it, expect } from "vitest";
import { consentState, pickLastGroomRecord, groomRecordSummary } from "@/lib/visit-record";

const t = (iso: string) => new Date(iso);

describe("consentState", () => {
  it("is 'none' until the owner is asked", () => {
    expect(
      consentState({ consentRequestedAt: null, consentGrantedAt: null, consentDeclinedAt: null })
    ).toBe("none");
  });

  it("is 'pending' once asked with no answer back", () => {
    expect(
      consentState({
        consentRequestedAt: t("2026-09-14T16:00:00Z"),
        consentGrantedAt: null,
        consentDeclinedAt: null,
      })
    ).toBe("pending");
  });

  it("reads granted and declined answers", () => {
    const asked = t("2026-09-14T16:00:00Z");
    expect(
      consentState({ consentRequestedAt: asked, consentGrantedAt: t("2026-09-14T16:05:00Z"), consentDeclinedAt: null })
    ).toBe("granted");
    expect(
      consentState({ consentRequestedAt: asked, consentGrantedAt: null, consentDeclinedAt: t("2026-09-14T16:05:00Z") })
    ).toBe("declined");
  });

  // The counter can be told one thing on the phone and another at the door.
  // The later answer is the one the shop acts on.
  it("takes the most recent answer when both are recorded", () => {
    expect(
      consentState({
        consentRequestedAt: t("2026-09-14T16:00:00Z"),
        consentGrantedAt: t("2026-09-14T16:05:00Z"),
        consentDeclinedAt: t("2026-09-14T16:20:00Z"),
      })
    ).toBe("declined");
    expect(
      consentState({
        consentRequestedAt: t("2026-09-14T16:00:00Z"),
        consentGrantedAt: t("2026-09-14T16:30:00Z"),
        consentDeclinedAt: t("2026-09-14T16:20:00Z"),
      })
    ).toBe("granted");
  });

  // An answer without a request is still an answer — a groomer who asks the
  // owner face to face never presses "ask".
  it("honours an answer that was never formally requested", () => {
    expect(
      consentState({ consentRequestedAt: null, consentGrantedAt: t("2026-09-14T16:05:00Z"), consentDeclinedAt: null })
    ).toBe("granted");
  });
});

describe("pickLastGroomRecord", () => {
  const visit = (id: string, completedAt: string | null, blade: string | null) => ({
    id,
    completedAt: completedAt ? t(completedAt) : null,
    scheduledAt: t("2026-01-01T00:00:00Z"),
    groomBlade: blade,
    groomShampoo: null,
    groomRecordNotes: null,
  });

  it("returns null when nothing has been written down", () => {
    expect(pickLastGroomRecord([visit("a", "2026-05-01T00:00:00Z", null)])).toBeNull();
    expect(pickLastGroomRecord([])).toBeNull();
  });

  it("skips visits with no record and takes the most recent that has one", () => {
    const picked = pickLastGroomRecord([
      visit("newest-but-blank", "2026-06-01T00:00:00Z", null),
      visit("wanted", "2026-05-01T00:00:00Z", "#7F"),
      visit("older", "2026-04-01T00:00:00Z", "#5"),
    ]);
    expect(picked?.id).toBe("wanted");
  });

  it("does not assume the rows arrive in order", () => {
    const picked = pickLastGroomRecord([
      visit("older", "2026-04-01T00:00:00Z", "#5"),
      visit("wanted", "2026-05-01T00:00:00Z", "#7F"),
    ]);
    expect(picked?.id).toBe("wanted");
  });

  // A visit that was never marked complete still has a date the shop can sort
  // on, and a groomer who wrote the blade down on it meant it.
  it("falls back to the scheduled date when a visit never completed", () => {
    const unfinished = {
      id: "unfinished",
      completedAt: null,
      scheduledAt: t("2026-07-01T00:00:00Z"),
      groomBlade: "#4F",
      groomShampoo: null,
      groomRecordNotes: null,
    };
    const picked = pickLastGroomRecord([visit("done", "2026-05-01T00:00:00Z", "#7F"), unfinished]);
    expect(picked?.id).toBe("unfinished");
  });

  it("counts a shampoo or a note as a record on its own", () => {
    const shampooOnly = {
      id: "shampoo",
      completedAt: t("2026-05-01T00:00:00Z"),
      scheduledAt: t("2026-05-01T00:00:00Z"),
      groomBlade: null,
      groomShampoo: "Oatmeal",
      groomRecordNotes: null,
    };
    expect(pickLastGroomRecord([shampooOnly])?.id).toBe("shampoo");
  });

  // Whitespace typed into a box and saved is not a record.
  it("ignores blank strings", () => {
    const blank = {
      id: "blank",
      completedAt: t("2026-05-01T00:00:00Z"),
      scheduledAt: t("2026-05-01T00:00:00Z"),
      groomBlade: "  ",
      groomShampoo: "",
      groomRecordNotes: null,
    };
    expect(pickLastGroomRecord([blank])).toBeNull();
  });
});

describe("groomRecordSummary", () => {
  it("joins only what was filled in", () => {
    expect(
      groomRecordSummary({ groomBlade: "#7F", groomShampoo: null, groomRecordNotes: "Left the head long" })
    ).toBe("#7F · Left the head long");
    expect(groomRecordSummary({ groomBlade: null, groomShampoo: null, groomRecordNotes: null })).toBe("");
  });
});
