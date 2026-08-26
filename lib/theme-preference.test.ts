import { describe, expect, it } from "vitest";
import { ThemePreference } from "@prisma/client";
import { readTheme } from "@/lib/theme-preference";

describe("readTheme", () => {
  it("takes the three real values", () => {
    expect(readTheme("LIGHT")).toBe(ThemePreference.LIGHT);
    expect(readTheme("DARK")).toBe(ThemePreference.DARK);
    expect(readTheme("SYSTEM")).toBe(ThemePreference.SYSTEM);
  });

  it("falls back to following the device for anything else", () => {
    // Anything but these three would be a database error on an enum column.
    expect(readTheme(null)).toBe(ThemePreference.SYSTEM);
    expect(readTheme("")).toBe(ThemePreference.SYSTEM);
    expect(readTheme("toString")).toBe(ThemePreference.SYSTEM);
    expect(readTheme(new File([], "x"))).toBe(ThemePreference.SYSTEM);
  });
});
