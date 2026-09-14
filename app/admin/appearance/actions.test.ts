import { beforeEach, expect, it, vi } from "vitest";
import { saveAppearance } from "./actions";

const { update, requireManager } = vi.hoisted(() => ({ update: vi.fn(), requireManager: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { systemConfig: { update } } }));
vi.mock("@/lib/auth-guards", () => ({ requireManager }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
beforeEach(() => vi.clearAllMocks());

it.each([
  ["calendar", "default", true, false],
  ["shop", "default", false, true],
  ["template:teal", "teal", false, false],
])("saves %s as the only active theme option", async (choice, preset, calendar, shop) => {
  const form = new FormData();
  form.set("themeChoice", String(choice));
  await expect(saveAppearance(form)).rejects.toThrow("/admin/appearance?saved=1");
  expect(requireManager).toHaveBeenCalled();
  expect(update).toHaveBeenCalledWith({ where: { id: "global" }, data: {
    themePreset: preset, themeAutoSeasonal: calendar, themeUseShopColors: shop,
  } });
});

it("rejects multiple submitted choices without saving", async () => {
  const form = new FormData();
  form.append("themeChoice", "shop");
  form.append("themeChoice", "calendar");
  await expect(saveAppearance(form)).rejects.toThrow("error=unknown_preset");
  expect(update).not.toHaveBeenCalled();
});
