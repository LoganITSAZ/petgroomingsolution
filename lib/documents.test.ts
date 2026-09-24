import { expect, it } from "vitest";
import { bumpVersion } from "./documents";

it("increments the trailing number, whatever it is attached to", () => {
  expect(bumpVersion("1.0")).toBe("1.1");
  expect(bumpVersion("1.9")).toBe("1.10");
  expect(bumpVersion("2")).toBe("3");
  expect(bumpVersion("v3.9")).toBe("v3.10");
  // No number to move: a suffix rather than a guess at what the shop meant.
  expect(bumpVersion("draft")).toBe("draft.1");
  expect(bumpVersion(null)).toBe("1.0");
  expect(bumpVersion("  ")).toBe("1.0");
});
