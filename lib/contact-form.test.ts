import { expect, it } from "vitest";
import { allowContactAttempt, clientKey, contactSettings } from "./contact-form";
it("limits repeated submissions and expires the limit", () => {
  for (let n = 0; n < 5; n++) expect(allowContactAttempt("test-client", 1000)).toBe(true);
  expect(allowContactAttempt("test-client", 1000)).toBe(false);
  expect(allowContactAttempt("test-client", 901001)).toBe(true);
});
it("requires a valid private recipient when enabled", () => {
  const settings = { contactFormEnabled: true, contactRecipient: "", contactRequirePhone: false, contactSuccessMessage: "Thanks!" };
  expect(contactSettings.safeParse(settings).success).toBe(false);
  expect(contactSettings.safeParse({ ...settings, contactRecipient: "shop@example.com" }).success).toBe(true);
  expect(contactSettings.safeParse({ ...settings, contactFormEnabled: false }).success).toBe(true);
});
it("takes the proxy's own view of the caller, not a spoofable header", () => {
  const spoofed = new Headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.7", "x-real-ip": "203.0.113.7" });
  expect(clientKey(spoofed)).toBe("203.0.113.7");
  // No X-Real-IP: the last hop is the one the proxy appended.
  expect(clientKey(new Headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }))).toBe("203.0.113.7");
  expect(clientKey(new Headers())).toBe("unknown");
});
