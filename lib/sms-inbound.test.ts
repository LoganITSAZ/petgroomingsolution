import { describe, expect, it } from "vitest";
import { readInboundReply, twilioSignature, verifyTwilioSignature } from "./sms-inbound";

describe("twilioSignature", () => {
  // Twilio's own documented example, so a refactor here is caught by their maths
  // rather than by ours.
  const url = "https://example.com/myapp.php?foo=1&bar=2";
  const params = {
    Digits: "1234",
    To: "+18005551212",
    From: "+14158675310",
    Caller: "+14158675310",
    CallSid: "CA1234567890ABCDE",
  };

  it("matches the published vector", () => {
    expect(twilioSignature("12345", url, params)).toBe("L/OH5YylLD5NRKLltdqwSvS0BnU=");
  });

  it("rejects a wrong signature, a wrong URL and a missing token", () => {
    const good = twilioSignature("12345", url, params);
    expect(verifyTwilioSignature("12345", url, params, good)).toBe(true);
    expect(verifyTwilioSignature("12345", url, params, "nope")).toBe(false);
    expect(verifyTwilioSignature("12345", url + "&x=1", params, good)).toBe(false);
    expect(verifyTwilioSignature("12345", url, { ...params, Digits: "9999" }, good)).toBe(false);
    expect(verifyTwilioSignature("", url, params, good)).toBe(false);
    expect(verifyTwilioSignature("12345", url, params, null)).toBe(false);
  });
});

describe("readInboundReply", () => {
  it("reads an approval", () => {
    for (const body of ["yes", "Yes please", "Y", "ok", "Okay go ahead", "approved", "sure, do it"]) {
      expect(readInboundReply(body)).toBe("granted");
    }
  });

  it("reads a refusal, and lets negation beat agreement", () => {
    for (const body of ["no", "No thanks", "nope", "do not", "not ok", "please dont", "decline"]) {
      expect(readInboundReply(body)).toBe("declined");
    }
  });

  it("keeps a carrier opt-out out of the answer", () => {
    expect(readInboundReply("STOP")).toBe("optout");
    expect(readInboundReply("unsubscribe")).toBe("optout");
    // A sentence about stopping the groom is not the keyword.
    expect(readInboundReply("please stop the groom and call me")).toBe("declined");
  });

  it("refuses to guess", () => {
    for (const body of ["", "   ", "how much will that cost?", "maybe", "call me"]) {
      expect(readInboundReply(body)).toBe("unclear");
    }
  });
});
