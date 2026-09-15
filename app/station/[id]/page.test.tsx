// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StationDisplay from "./page";
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "station-1" }), useRouter: () => router }));
let stream: FakeStream;
class FakeStream {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() { stream = this; }
}
const visit = {
  id: "visit-1", status: "CHECKED_IN", serviceType: "FULL_GROOM", scheduledAt: "2026-09-13T17:00:00Z", checkedInAt: null, durationMins: 60,
  visitNotes: "Keep the tail long", staff: { name: "Alex" }, services: [],
  pet: { id: "pet-1", name: "Pepper", species: "DOG", sex: "FEMALE", breed: "Poodle", weightLbs: 12, coatType: null, dateOfBirth: null, vaccinationsConfirmedAt: null, isActive: true, hasBiteHistory: true, healthFlags: ["Sensitive skin"], temperamentNotes: "Nervous around dryers", groomingNotes: "Use unscented shampoo", photoId: null, photoUrl: null },
  customer: { id: "customer-1", firstName: "Jamie", lastName: "Rivera", email: "jamie@example.com", phone: "555-1234", address: "12 Main Street", smsOptOut: false, preferredStaff: null, pricingTier: null, pricingNotes: null, isActive: true, alternateContacts: [{ id: "contact-1", name: "Pat Rivera", phone: "555-5678", email: null }] },
};
function send(data: unknown) { act(() => stream.onmessage?.({ data: JSON.stringify(data) })); }
beforeEach(() => {
  vi.stubGlobal("EventSource", FakeStream);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { userType: "staff" } }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows the assigned customer's contacts and pet instructions, then replaces them on reassignment", () => {
  render(<StationDisplay />);
  expect(screen.queryByText("No pet assigned")).not.toBeInTheDocument();
  send({ station: { id: "station-1", name: "Table 1", role: "GROOMER", isActive: true }, appointments: [visit] });
  expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "555-1234" })).toHaveAttribute("href", "tel:555-1234");
  expect(screen.getByText("Pat Rivera")).toBeInTheDocument();
  expect(screen.getByText("Nervous around dryers")).toBeInTheDocument();
  expect(screen.getByText("Use unscented shampoo")).toBeInTheDocument();
  expect(screen.getByText("Keep the tail long")).toBeInTheDocument();
  send({ station: { id: "station-1", name: "Table 1", role: "GROOMER", isActive: true }, appointments: [] });
  expect(screen.getByText("No pet assigned")).toBeInTheDocument();
  expect(screen.queryByText("Jamie Rivera")).not.toBeInTheDocument();
});
it("rides out the reconnect, then marks stale data offline and closes the stream on unmount", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { unmount } = render(<StationDisplay />);
  send({ station: { id: "station-1", name: "Table 1", role: "GROOMER", isActive: true }, appointments: [visit] });

  // The server closes the stream once a minute on purpose. A groomer must not
  // lose the advance button for the second it takes EventSource to come back.
  await act(async () => stream.onerror?.());
  expect(screen.getByRole("status")).toHaveTextContent("Live updates");
  expect(screen.getByRole("button", { name: /→/ })).toBeEnabled();

  await act(async () => { vi.advanceTimersByTime(7_000); });
  expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");
  expect(screen.getByRole("button", { name: /→/ })).toBeDisabled();

  unmount();
  expect(stream.close).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it("clears the offline countdown when the stream comes back", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  render(<StationDisplay />);
  const board = { station: { id: "station-1", name: "Table 1", role: "GROOMER", isActive: true }, appointments: [visit] };
  send(board);
  await act(async () => stream.onerror?.());
  send(board);
  await act(async () => { vi.advanceTimersByTime(7_000); });
  expect(screen.getByRole("status")).toHaveTextContent("Live updates");
  vi.useRealTimers();
});
it("shows the selected kennel pet's full record", () => {
  render(<StationDisplay />);
  const other = { ...visit, id: "visit-2", pet: { ...visit.pet, name: "Biscuit" } };
  send({ station: { id: "station-1", name: "Kennel bank", role: "KENNEL", isActive: true }, kennels: [{ id: "door-1", label: "A1", isActive: true, appointments: [visit, other] }] });
  fireEvent.click(screen.getByRole("button", { name: /Biscuit/ }));
  expect(screen.getByRole("heading", { name: "Biscuit" })).toBeInTheDocument();
  expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
});
