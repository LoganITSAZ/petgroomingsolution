// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContactForm from "./ContactForm";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("keeps the message after a delivery failure and clears it after success", async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Delivery failed" }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ message: "Thanks, we received it." }) });
  vi.stubGlobal("fetch", fetch);
  render(<ContactForm enabled requirePhone={false} />);
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Sam" } });
  fireEvent.change(screen.getByLabelText("Your email"), { target: { value: "sam@example.com" } });
  fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Can I bring my dog?" } });
  fireEvent.submit(screen.getByRole("button", { name: "Send message" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Delivery failed");
  expect(screen.getByLabelText("Your message")).toHaveValue("Can I bring my dog?");
  fireEvent.submit(screen.getByRole("button", { name: "Send message" }).closest("form")!);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Thanks, we received it."));
  expect(screen.getByLabelText("Your message")).toHaveValue("");
});
it("shows the disabled state without a submit button", () => {
  render(<ContactForm enabled={false} requirePhone={false} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText(/Messaging is currently unavailable/)).toBeInTheDocument();
});
