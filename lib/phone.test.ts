import { describe, expect, it } from "vitest";
import { formatPhone, toE164 } from "./phone";

describe("toE164", () => {
  it("assumes North America for a bare ten-digit number", () => {
    expect(toE164("(602) 555-0134")).toBe("+16025550134");
    expect(toE164("602-555-0134")).toBe("+16025550134");
  });

  it("keeps a country code written without its plus", () => {
    expect(toE164("1 602 555 0134")).toBe("+16025550134");
  });

  it("takes an explicit country code at its word", () => {
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("ignores whatever the counter wrote beside the number", () => {
    expect(toE164("602-555-0134 cell")).toBe("+16025550134");
  });

  it("returns null rather than a number a carrier would bounce", () => {
    expect(toE164("555-0134")).toBeNull();
    expect(toE164("+123")).toBeNull();
    expect(toE164("+1234567890123456")).toBeNull();
    expect(toE164("call the house")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});

describe("formatPhone", () => {
  it("reads a North American number back the way it is said", () => {
    expect(formatPhone("6025550134")).toBe("(602) 555-0134");
  });

  it("leaves an international number in E.164", () => {
    expect(formatPhone("+442079460958")).toBe("+442079460958");
  });

  it("hands back what was typed when it cannot be a number", () => {
    expect(formatPhone(" call the house ")).toBe("call the house");
    expect(formatPhone(null)).toBeNull();
  });
});
