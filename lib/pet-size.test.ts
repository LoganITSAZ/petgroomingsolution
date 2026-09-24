import { describe, it, expect } from "vitest";
import {
  DEFAULT_SIZE_CUTOFFS,
  describeSize,
  sizeCutoffs,
  sizeForWeight,
  sizePet,
  sizeRange,
} from "./pet-size";

const cutoffs = DEFAULT_SIZE_CUTOFFS;

describe("sizeForWeight", () => {
  it.each([
    [1, "SMALL"],
    [14.9, "SMALL"],
    [15, "MEDIUM"],
    [29.9, "MEDIUM"],
    [30, "LARGE"],
    [50, "LARGE"],
    [50.1, "XL"],
    [120, "XL"],
  ] as const)("%s lb is %s", (lbs, size) => {
    expect(sizeForWeight(lbs, cutoffs)).toBe(size);
  });
});

describe("sizeCutoffs", () => {
  it("reads the three columns", () => {
    expect(
      sizeCutoffs({ sizeSmallUnderLbs: 10, sizeMediumUnderLbs: 25, sizeLargeMaxLbs: 60 })
    ).toEqual({ smallUnder: 10, mediumUnder: 25, largeMax: 60 });
  });

  it("nudges out-of-order values up so no size is empty", () => {
    expect(
      sizeCutoffs({ sizeSmallUnderLbs: 30, sizeMediumUnderLbs: 20, sizeLargeMaxLbs: 10 })
    ).toEqual({ smallUnder: 30, mediumUnder: 31, largeMax: 32 });
  });

  it("falls back to defaults for nonsense", () => {
    expect(
      sizeCutoffs({ sizeSmallUnderLbs: 0, sizeMediumUnderLbs: NaN, sizeLargeMaxLbs: -5 })
    ).toEqual(DEFAULT_SIZE_CUTOFFS);
  });
});

describe("sizePet", () => {
  it("uses the typed weight over the breed estimate", () => {
    expect(sizePet({ species: "DOG", weightLbs: 12 }, { typicalWeightLbs: 70 }, cutoffs)).toEqual({
      size: "SMALL",
      lbs: 12,
      estimated: false,
    });
  });

  it("falls back to the breed estimate", () => {
    expect(sizePet({ species: "DOG", weightLbs: null }, { typicalWeightLbs: 65 }, cutoffs)).toEqual({
      size: "XL",
      lbs: 65,
      estimated: true,
    });
  });

  it("is null for a dog with no weight and no estimate", () => {
    expect(sizePet({ species: "DOG", weightLbs: null }, null, cutoffs)).toBeNull();
    expect(sizePet({ species: "DOG", weightLbs: null }, { typicalWeightLbs: null }, cutoffs)).toBeNull();
  });

  it("never sizes a cat or other pet", () => {
    expect(sizePet({ species: "CAT", weightLbs: 60 }, null, cutoffs)).toBeNull();
    expect(sizePet({ species: "OTHER", weightLbs: 60 }, null, cutoffs)).toBeNull();
  });

  it("ignores a non-positive weight", () => {
    expect(sizePet({ species: "DOG", weightLbs: 0 }, { typicalWeightLbs: 20 }, cutoffs)).toEqual({
      size: "MEDIUM",
      lbs: 20,
      estimated: true,
    });
  });

  it("does not lend a breed's weight to a smaller variety matched loosely", () => {
    const aussie = { breed: "Australian Shepherd", typicalWeightLbs: 50 };
    expect(
      sizePet({ species: "DOG", weightLbs: null, breed: "Miniature Australian Shepherd" }, aussie, cutoffs)
    ).toBeNull();
    expect(sizePet({ species: "DOG", weightLbs: null, breed: "Toy Aussie" }, aussie, cutoffs)).toBeNull();
    expect(
      sizePet({ species: "DOG", weightLbs: null, breed: "Mini Golden Retriever" }, { breed: "Golden Retriever", typicalWeightLbs: 65 }, cutoffs)
    ).toBeNull();
  });

  it("uses a variety's own guide, and a typed weight on any variety", () => {
    expect(
      sizePet({ species: "DOG", weightLbs: null, breed: "miniature schnauzer" }, { breed: "Miniature Schnauzer", typicalWeightLbs: 15 }, cutoffs)
    ).toEqual({ size: "MEDIUM", lbs: 15, estimated: true });
    expect(
      sizePet({ species: "DOG", weightLbs: 25, breed: "Mini Aussie" }, { breed: "Australian Shepherd", typicalWeightLbs: 50 }, cutoffs)
    ).toEqual({ size: "MEDIUM", lbs: 25, estimated: false });
    expect(
      sizePet({ species: "DOG", weightLbs: null, breed: "Labrador" }, { breed: "Labrador Retriever", typicalWeightLbs: 65 }, cutoffs)
    ).toEqual({ size: "XL", lbs: 65, estimated: true });
  });
});

describe("labels", () => {
  it("draws ranges from the cutoffs", () => {
    expect(sizeRange("SMALL", cutoffs)).toBe("Under 15 lb");
    expect(sizeRange("MEDIUM", cutoffs)).toBe("15–30 lb");
    expect(sizeRange("LARGE", cutoffs)).toBe("30–50 lb");
    expect(sizeRange("XL", cutoffs)).toBe("Over 50 lb");
  });

  it("describes where the size came from", () => {
    expect(describeSize({ size: "LARGE", lbs: 42, estimated: false }, "DOG")).toBe("Large · 42 lb");
    expect(describeSize({ size: "LARGE", lbs: 40, estimated: true }, "DOG")).toBe(
      "Large · ~40 lb (breed estimate)"
    );
    expect(describeSize(null, "DOG")).toBe("Size unknown — add a weight");
    expect(describeSize(null, "CAT")).toBeNull();
  });
});
