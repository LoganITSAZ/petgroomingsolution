import { describe, expect, it } from "vitest";
import { RESOURCE_SECTIONS, countEntries, filterSections } from "./resources";

describe("filterSections", () => {
  it("returns everything for an empty query", () => {
    expect(filterSections(RESOURCE_SECTIONS, "   ")).toEqual(RESOURCE_SECTIONS);
  });

  it("matches a blade number and keeps only that entry", () => {
    const found = filterSections(RESOURCE_SECTIONS, "#4f");
    expect(found).toHaveLength(1);
    expect(found[0].entries.map((entry) => entry.term)).toEqual(["#4F"]);
  });

  it("matches a measurement written in the note", () => {
    const terms = filterSections(RESOURCE_SECTIONS, '1/4"').flatMap((section) =>
      section.entries.map((entry) => entry.term)
    );
    expect(terms).toContain("#5F");
  });

  it("keeps a whole section when the section itself matches", () => {
    const found = filterSections(RESOURCE_SECTIONS, "blade & comb");
    expect(found).toHaveLength(1);
    expect(found[0].entries).toHaveLength(
      RESOURCE_SECTIONS.find((section) => section.slug === "blades")!.entries.length
    );
  });

  it("ANDs words so a second one narrows the result", () => {
    const wide = countEntries(filterSections(RESOURCE_SECTIONS, "coat"));
    const narrow = countEntries(filterSections(RESOURCE_SECTIONS, "coat double"));
    expect(narrow).toBeLessThan(wide);
    expect(narrow).toBeGreaterThan(0);
  });

  it("drops sections with no matching entry", () => {
    expect(filterSections(RESOURCE_SECTIONS, "zzzznope")).toEqual([]);
  });

  it("leads with safety", () => {
    expect(RESOURCE_SECTIONS[0].slug).toBe("safety");
  });
});
