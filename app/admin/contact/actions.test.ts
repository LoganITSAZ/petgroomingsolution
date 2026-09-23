import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), update: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(url); }) }));
vi.mock("@/lib/auth-guards", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/lib/prisma", () => ({ prisma: { systemConfig: { update: mocks.update } } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { saveContactSettings } from "./actions";
beforeEach(() => vi.clearAllMocks());
it("rejects unauthorized settings changes", async () => {
  mocks.guard.mockRejectedValueOnce(new Error("Unauthorized"));
  await expect(saveContactSettings(new FormData())).rejects.toThrow("Unauthorized");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("saves validated settings for an admin", async () => {
  const form = new FormData();
  form.set("contactFormEnabled", "on");
  form.set("contactRecipient", "private@example.com");
  form.set("contactSuccessMessage", "Thanks!");
  await expect(saveContactSettings(form)).rejects.toThrow("/admin/contact?saved=1");
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: "global" }, data: { contactFormEnabled: true, contactRecipient: "private@example.com", contactRequirePhone: false, contactSuccessMessage: "Thanks!" } });
});
