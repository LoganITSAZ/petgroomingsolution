// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/config", () => ({ getConfig: vi.fn() }));
import { getConfig } from "@/lib/config";
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
  // shopContact() fills gaps with sample details; a privacy request must never go to one.
  expect(document.body.textContent).not.toMatch(/555-0147|example\.com|Example Lane/);
});
