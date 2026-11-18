import { describe, expect, it } from "vitest";
import { allowAuthAttempt } from "./auth-rate-limit";

describe("public authentication action limits", () => {
  it("limits each address and action, then allows attempts after the window", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.18" });
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(allowAuthAttempt("register", headers, 1_000)).toBe(true);
    }

    expect(allowAuthAttempt("register", headers, 1_000)).toBe(false);
    expect(allowAuthAttempt("password-reset", headers, 1_000)).toBe(true);
    expect(
      allowAuthAttempt("register", new Headers({ "x-real-ip": "203.0.113.19" }), 1_000)
    ).toBe(true);
    expect(allowAuthAttempt("register", headers, 901_001)).toBe(true);
  });
});
