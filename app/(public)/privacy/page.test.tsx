// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/config", () => ({ getConfig: vi.fn() }));
vi.mock("@/lib/maps", () => ({ geocode: vi.fn(async () => null) }));
vi.mock("@/lib/seo-pages", () => ({ activeFaq: vi.fn(async () => []) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
// Client islands that need a real browser or a mounted app router, and carry no contact details.
vi.mock("@/components/PublicStatusRefresh", () => ({ default: () => null }));
vi.mock("@/components/PublicThemeToggle", () => ({ default: () => null, NO_FLASH_SCRIPT: "" }));
import { getConfig } from "@/lib/config";
import PublicLayout from "../layout";
import PrivacyPage from "./page";

type Config = Awaited<ReturnType<typeof getConfig>>;

const shop = {
  shopName: "Bark & Bubbles",
  shopEmail: "hello@bark.test",
  shopPhone: null,
  shopAddress: null,
  twilioAccountSid: null,
  twilioAuthToken: null,
  twilioFromNumber: null,
  paymentProvider: null,
  featureSmsNotify: false,
  featureVoiceCalls: false,
  featureCounterPayments: false,
  featureTestimonials: false,
} as unknown as Config;

afterEach(cleanup);

it("carries the text-message terms a carrier asks for once Twilio is set up, before texts are switched on", async () => {
  vi.mocked(getConfig).mockResolvedValue({
    ...shop,
    twilioAccountSid: "AC123",
    twilioAuthToken: "token",
    twilioFromNumber: "+16025550100",
  });
  render(await PrivacyPage());
  expect(screen.getByRole("heading", { name: "Text messages" })).toBeTruthy();
  expect(screen.getByText(/Reply STOP/)).toBeTruthy();
  expect(screen.getByText(/never share your mobile number/)).toBeTruthy();
  expect(screen.getByText(/Twilio/)).toBeTruthy();
});

it("says nothing about texts, and gives only the contact details the shop saved", async () => {
  vi.mocked(getConfig).mockResolvedValue(shop);
  render(await PrivacyPage());
  expect(screen.queryByRole("heading", { name: "Text messages" })).toBeNull();
  expect(screen.queryByText(/Twilio/)).toBeNull();
  expect(screen.getByRole("link", { name: "hello@bark.test" })).toBeTruthy();
  // The site used to fill unset details with samples; a privacy request must never go to one.
  expect(document.body.textContent).not.toMatch(/555-0147|example\.com|Example Lane/);
});

it("shows no sample contact details anywhere on the route, the shared footer included", async () => {
  vi.mocked(getConfig).mockResolvedValue({
    ...shop,
    businessHours: {},
    shopTimezone: "America/Phoenix",
    featureOnlineBooking: false,
  } as unknown as Config);
  render(await PublicLayout({ children: await PrivacyPage() }));
  expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/555-0147|example\.com|Example Lane/);
});
