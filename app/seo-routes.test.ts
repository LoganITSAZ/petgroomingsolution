import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({ getConfig: vi.fn() }));
import { getConfig } from "@/lib/config";
import robots from "./robots";
import sitemap from "./sitemap";

beforeEach(() => vi.resetAllMocks());

it("discovers only public pages and follows website settings changes", async () => {
  const updatedAt = new Date("2026-09-21T10:00:00Z");
  vi.mocked(getConfig).mockResolvedValue({ shopWebsite: "https://grooming.test", updatedAt } as Awaited<ReturnType<typeof getConfig>>);
  expect(await sitemap()).toEqual(["/", "/services", "/about", "/contact"].map((path) => ({ url: new URL(path, "https://grooming.test").href, lastModified: updatedAt })));
  expect(await robots()).toMatchObject({ sitemap: "https://grooming.test/sitemap.xml", rules: { allow: "/", disallow: ["/api/"] } });
  vi.mocked(getConfig).mockResolvedValue({ shopWebsite: "https://moved.test" } as Awaited<ReturnType<typeof getConfig>>);
  expect((await sitemap())[0].url).toBe("https://moved.test/");
  expect((await robots()).sitemap).toBe("https://moved.test/sitemap.xml");
});

it("does not advertise localhost or sample URLs before website setup", async () => {
  vi.mocked(getConfig).mockResolvedValue({ shopWebsite: null } as Awaited<ReturnType<typeof getConfig>>);
  expect(await sitemap()).toEqual([]);
  expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
});
