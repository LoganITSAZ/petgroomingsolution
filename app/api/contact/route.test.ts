import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getConfig: vi.fn(), send: vi.fn(), allow: vi.fn() }));
vi.mock("@/lib/config", () => ({ getConfig: mocks.getConfig }));
vi.mock("@/lib/email", () => ({ sendContactMessage: mocks.send }));
vi.mock("@/lib/contact-form", async importOriginal => ({ ...await importOriginal<object>(), allowContactAttempt: mocks.allow }));
import { POST } from "./route";
const body = { name: "Sam", email: "sam@example.com", phone: "", message: "Can I book a grooming appointment?", website: "" };
function request(data: unknown = body, origin = "http://localhost") {
  return new Request("http://localhost/api/contact", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(data) });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESEND_API_KEY", "test-key");
  mocks.allow.mockReturnValue(true);
  mocks.getConfig.mockResolvedValue({ contactFormEnabled: true, contactRecipient: "private@example.com", contactRequirePhone: false, contactSuccessMessage: "Thank you!" });
  mocks.send.mockResolvedValue(undefined);
});
describe("contact delivery", () => {
  it("delivers to the configured recipient and returns only the confirmation", async () => {
    const response = await POST(request({ ...body, to: "attacker@example.com" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Thank you!" });
    expect(mocks.send).toHaveBeenCalledWith({ ...body, to: "private@example.com" });
  });
  it("rejects invalid email and short messages", async () => {
    expect((await POST(request({ ...body, email: "invalid", message: "hi" }))).status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects spam and cross-origin submissions", async () => {
    expect((await POST(request({ ...body, website: "spam" }))).status).toBe(400);
    expect((await POST(request(body, "https://elsewhere.test"))).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("enforces the phone setting on the server", async () => {
    mocks.getConfig.mockResolvedValue({ contactFormEnabled: true, contactRecipient: "private@example.com", contactRequirePhone: true });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([
    { contactFormEnabled: false, contactRecipient: "private@example.com" },
    { contactFormEnabled: true, contactRecipient: null },
  ])("rejects unavailable configuration", async config => {
    mocks.getConfig.mockResolvedValue(config);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("reports missing credentials and provider failures without claiming success", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("RESEND_API_KEY", "test");
    mocks.send.mockRejectedValue(new Error("Provider rejected"));
    expect((await POST(request())).status).toBe(502);
  });
  it("limits attempts and actual request size", async () => {
    mocks.allow.mockReturnValue(false);
    expect((await POST(request())).status).toBe(429);
    mocks.allow.mockReturnValue(true);
    expect((await POST(request({ ...body, message: "x".repeat(33000) }))).status).toBe(413);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
