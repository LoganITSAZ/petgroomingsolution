import { describe, expect, it } from "vitest";
import { VisitPhotoKind } from "@prisma/client";
import { beforeAfter, ownerPhotos, readKind, sortPhotos } from "./visit-photos";

function photo(
  id: string,
  kind: VisitPhotoKind,
  minutes: number,
  ownerVisible = false
) {
  return { id, kind, ownerVisible, createdAt: new Date(2026, 8, 14, 9, minutes) };
}

describe("sortPhotos", () => {
  it("puts before, after and issues in that order", () => {
    const sorted = sortPhotos([
      photo("i", VisitPhotoKind.ISSUE, 30),
      photo("a", VisitPhotoKind.AFTER, 20),
      photo("b", VisitPhotoKind.BEFORE, 10),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["b", "a", "i"]);
  });

  it("keeps a kind in the order it was shot", () => {
    const sorted = sortPhotos([
      photo("second", VisitPhotoKind.ISSUE, 40),
      photo("first", VisitPhotoKind.ISSUE, 20),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["first", "second"]);
  });

  it("does not mutate what it was given", () => {
    const photos = [photo("a", VisitPhotoKind.AFTER, 20), photo("b", VisitPhotoKind.BEFORE, 10)];
    sortPhotos(photos);
    expect(photos.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("beforeAfter", () => {
  it("takes the latest of each kind, so a reshoot wins", () => {
    const { before, after } = beforeAfter([
      photo("blurred", VisitPhotoKind.BEFORE, 5),
      photo("good", VisitPhotoKind.BEFORE, 15),
      photo("done", VisitPhotoKind.AFTER, 90),
    ]);
    expect(before?.id).toBe("good");
    expect(after?.id).toBe("done");
  });

  it("tolerates a missing side", () => {
    // A walk-in nobody photographed on arrival still has an after.
    const { before, after } = beforeAfter([photo("done", VisitPhotoKind.AFTER, 90)]);
    expect(before).toBeNull();
    expect(after?.id).toBe("done");
  });

  it("ignores issue photos", () => {
    const { before, after } = beforeAfter([photo("mat", VisitPhotoKind.ISSUE, 10)]);
    expect(before).toBeNull();
    expect(after).toBeNull();
  });
});

describe("ownerPhotos", () => {
  it("returns only what was ticked, in display order", () => {
    const shown = ownerPhotos([
      photo("mat", VisitPhotoKind.ISSUE, 10, false),
      photo("done", VisitPhotoKind.AFTER, 90, true),
      photo("arrived", VisitPhotoKind.BEFORE, 5, true),
    ]);
    expect(shown.map((p) => p.id)).toEqual(["arrived", "done"]);
  });

  it("returns nothing when nothing was ticked", () => {
    expect(ownerPhotos([photo("mat", VisitPhotoKind.ISSUE, 10)])).toEqual([]);
  });
});

describe("readKind", () => {
  it("accepts a declared kind", () => {
    expect(readKind("BEFORE")).toBe(VisitPhotoKind.BEFORE);
  });

  it("refuses an inherited property name", () => {
    // `in` would accept this and the enum column would reject it.
    expect(readKind("toString")).toBeNull();
  });

  it("refuses anything else", () => {
    expect(readKind("SIDEWAYS")).toBeNull();
    expect(readKind(undefined)).toBeNull();
    expect(readKind(3)).toBeNull();
  });
});
