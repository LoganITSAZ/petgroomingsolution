import "@testing-library/jest-dom/vitest";
import { afterEach, expect } from "vitest";
import { toHaveNoViolations } from "jest-axe";
import { cleanup } from "@testing-library/react";

// Global for every test file regardless of environment (node or jsdom) —
// only files that render components opt into jsdom via a docblock.
expect.extend(toHaveNoViolations);

// Without this, a second render() in the same jsdom file piles its DOM on
// top of the first test's — vitest has no globals.testEnvironment-driven
// auto-cleanup the way Jest does. Guarded so node-environment test files
// (no `document`) never touch this.
afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
