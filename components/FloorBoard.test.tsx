// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { axe } from "jest-axe";
import FloorBoard, { type BoardPet } from "./FloorBoard";

// The board is a client component that refreshes the server render after a
// move; nothing here exercises that, it only has to exist.
vi.mock("next/navigation", () => {
  const router = { refresh: vi.fn() };
  return { useRouter: () => router };
});

const PETS: BoardPet[] = [
  {
    id: "a1",
    petName: "Fido",
    ownerName: "Sam Reyes",
    columnKey: "waiting",
    stationName: null,
    hasBiteHistory: false,
    checkInWarnings: [{ label: "allergy:chicken <b>not markup</b>", severity: "warning" }],
    vet: { name: "Paws Clinic", phone: "(602) 555-0100" },
  },
  {
    id: "a2",
    petName: "Mochi",
    ownerName: "Dana Wu",
    columnKey: "bath",
    stationName: "Bath 1",
    hasBiteHistory: true,
  },
];

function Board() {
  return (
    <FloorBoard
      pets={PETS}
      capacity={{ bath: { used: 1, capacity: 2 }, grooming: { used: 0, capacity: 4 } }}
      move={vi.fn(async () => ({ ok: true }))}
    />
  );
}

// A dialog line is a labelled key and its value in separate nodes; match the whole paragraph.
const dialogLine = (text: string | RegExp) => screen.getByText((_, element) =>
  element?.tagName === "P" && (typeof text === "string" ? element.textContent === text : text.test(element.textContent ?? "")));

describe("FloorBoard", () => {
  /* The tap path is the only way to move a pet, so it has to work on a
     touchscreen and a keyboard: every chip and every "Move here" is a real
     <button>, reachable by Tab. If jQuery ever builds these as divs the board
     becomes mouse-only on half the shop's screens. */
  it("builds every pet and every destination as a real button", () => {
    render(<Board />);

    expect(screen.getByRole("button", { name: /Fido/ })).not.toHaveAttribute("draggable");
    fireEvent.click(screen.getByRole("tab", { name: /Bathing/ }));
    expect(screen.getByRole("button", { name: /Mochi/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Mochi/ }));
    expect(screen.getByRole("button", { name: "Move here" })).toBeInTheDocument();
  });

  it("shows one labeled panel and supports keyboard tab navigation", () => {
    render(<Board />);

    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel", { name: /Waiting, / })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: /Waiting, / }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Bathing/ })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: /Bathing/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fido/ })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: /Bathing/ }), { key: "End" });
    expect(screen.getByRole("tab", { name: /Pickup/ })).toHaveAttribute("aria-selected", "true");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Board />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("announces the move politely rather than firing an alert", async () => {
    render(<Board />);
    fireEvent.click(screen.getByRole("button", { name: /Fido/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Grooming/ }));
    fireEvent.click(screen.getByRole("button", { name: "Move here" }));

    const live = await screen.findByText("Fido moved to Grooming", { selector: "[aria-live='polite']" });
    expect(live).toHaveClass("sr-only");
    expect(screen.getByRole("tabpanel", { name: /Grooming, 1 pets/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fido/ })).toBeInTheDocument();
  });
  it("keeps the active tab when server data refreshes", () => {
    const move = vi.fn(async () => ({ ok: true }));
    const { rerender } = render(<FloorBoard pets={PETS} capacity={{}} move={move} />);
    fireEvent.click(screen.getByRole("tab", { name: /Bathing/ }));
    rerender(<FloorBoard pets={[...PETS]} capacity={{}} move={move} />);
    expect(screen.getByRole("tab", { name: /Bathing/ })).toHaveAttribute("aria-selected", "true");
  });

  it("includes arrivals in the lifecycle without making them a move destination", async () => {
    const move = vi.fn(async () => ({ ok: true }));
    const { container } = render(<FloorBoard pets={PETS} capacity={{}} move={move} arrivals={[
      { id: "next1", petName: "Luna", arrivalTime: "10:00 AM", assignedTo: "Alex", note: "Past arrival time" },
    ]} />);
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByRole("tabpanel", { name: /Pending, 1 pets/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Luna/ })).toHaveAttribute("href", "/staff/appointments/next1");
    expect(screen.getByText(/Past arrival time/)).toBeInTheDocument();
    expect(screen.queryByText("Alerts for Luna")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(screen.getByRole("tab", { name: /Waiting, / }));
    fireEvent.click(screen.getByRole("button", { name: /Fido/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Pending/ }));
    expect(screen.queryByRole("button", { name: "Move here" })).not.toBeInTheDocument();
  });

  /* The shop-wide alert names every pet due a booster; this is the same fact on
     the card somebody is about to check in, which is the only moment a
     certificate can still be asked for. */
  it("carries a vaccination warning on the arrival it belongs to", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} arrivals={[
      { id: "next1", petName: "Luna", arrivalTime: "10:00 AM", assignedTo: "Alex", flags: [{ label: "Luna is not current on Rabies.", severity: "critical" }] },
      { id: "next2", petName: "Pip", arrivalTime: "11:00 AM", assignedTo: "Alex" },
    ]} />);
    // Folded into the card's flag, which opens a dismissible bubble.
    const toggle = screen.getByText("Alerts for Luna").closest("summary")!;
    expect(toggle.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(toggle);
    expect(toggle.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Luna is not current on Rabies.")).toBeInTheDocument();
    expect(screen.queryByText("Alerts for Pip")).not.toBeInTheDocument();
    fireEvent.keyDown(toggle, { key: "Escape" });
    expect(toggle.closest("details")).not.toHaveAttribute("open");
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    fireEvent.click(document.body);
    expect(toggle.closest("details")).not.toHaveAttribute("open");
  });

  it("opens flags above when they fit and flips below near the viewport top", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} arrivals={[
      { id: "next1", petName: "Luna", arrivalTime: "10:00 AM", assignedTo: "Alex", flags: [{ label: "Vaccination overdue", severity: "critical" }] },
    ]} />);
    const toggle = screen.getByText("Alerts for Luna").closest("summary")!;
    const details = toggle.closest("details")!;
    const bubble = details.querySelector("ul")!;
    const bounds = vi.spyOn(toggle, "getBoundingClientRect").mockReturnValue({ top: 200 } as DOMRect);
    vi.spyOn(bubble, "getBoundingClientRect").mockReturnValue({ height: 100 } as DOMRect);
    fireEvent.click(toggle);
    fireEvent(details, new Event("toggle"));
    expect(details).toHaveAttribute("data-placement", "above");
    bounds.mockReturnValue({ top: 50 } as DOMRect);
    fireEvent.scroll(document);
    expect(details).toHaveAttribute("data-placement", "below");
    bounds.mockReturnValue({ top: 200 } as DOMRect);
    fireEvent.resize(window);
    expect(details).toHaveAttribute("data-placement", "above");
  });

  it("shows an empty arrivals tab and opens it from the dashboard shortcut", () => {
    render(<><a href="#arrivals">Arrivals left today</a><FloorBoard pets={PETS} arrivals={[]} capacity={{}} move={vi.fn()} /></>);
    expect(screen.getByText("No more arrivals scheduled today.")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: /Bathing/ }));
    fireEvent.click(screen.getByRole("link", { name: "Arrivals left today" }));
    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveAttribute("aria-selected", "true");
  });

  it("assigns arrivals and waiting pets using named destinations", async () => {
    const assign = vi.fn(async () => ({ ok: true, columnKey: "bath", placedAt: "Bath 1 · east tub" }));
    const { container } = render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={assign}
      arrivals={[{ id: "next1", petName: "Luna", ownerName: "Sam Reyes", arrivalTime: "10:00 AM", assignedTo: "Alex",
        hasBiteHistory: true, services: "Full Groom, Nail Trim", bookedMins: 90, sizing: "Quoted as Large · 58 lb on record", visitNotes: "Keep the ears long", lastGroom: "#7 blade · oatmeal", rate: "Legacy 2015", offer: "Spring nails, code NAILS10", reward: "A free nail trim × 2", household: [{ id: "next2", name: "Max" }], ownerPhone: "(602) 555-0199", alternates: ["Jamie Reyes"], firstVisit: true, suggested: "station:bath1", needsKennel: true, checkInWarnings: [{ label: "Rabies: lapsed", severity: "critical" }] }]}
      destinations={[{ value: "station:bath1", label: "Bath 1", kind: "bath" }, { value: "kennel:k1", label: "Bank 1 · A1", kind: "kennel", note: "0 of 12 doors empty", tight: true }, { value: "station:g1", label: "Table 1", kind: "grooming", inUse: true, note: "Max" }]} />);
    expect(await axe(container)).toHaveNoViolations();
    // The select is gone: pick the pet, then its destination in the modal.
    expect(screen.getByRole("link", { name: /Luna/ })).toHaveTextContent("Sam Reyes");
    expect(screen.getByRole("link", { name: /Luna/ })).toHaveTextContent("Bite history recorded");
    expect(screen.getByRole("link", { name: /Luna/ })).toHaveTextContent("First visit · with Alex · Kennel · Reward ready");
    expect(screen.getByTitle(/^First visit · with Alex · Kennel/)).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check in Luna" }));
    expect(screen.getByRole("dialog", { name: "Check in Luna" })).toBeInTheDocument();
    // What the counter must know before taking the lead is in the dialog itself.
    expect(screen.getByText("⚠ Bite history")).toBeInTheDocument();
    expect(document.querySelector("dialog [data-bite]")).not.toBeNull();
    expect(screen.getByRole("link", { name: /Luna/ }).querySelector("[data-bite]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Bath 1" })).not.toHaveFocus();
    expect(screen.getByRole("button", { name: /Bank 1 · A1/ })).toHaveTextContent("0 of 12 doors empty");
    expect(screen.getByText("0 of 12 doors empty")).toHaveAttribute("data-tight");
    expect(screen.getByRole("button", { name: "Bath 1" })).toHaveAttribute("data-suggested");
    // An occupied table is shown but cannot be picked.
    expect(screen.getByRole("button", { name: /Table 1/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Table 1/ })).toHaveTextContent("In use · Max");
    expect(screen.getByText("All in use")).toBeInTheDocument();
    // Arrows walk the free destinations only, and wrap.
    fireEvent.keyDown(screen.getByRole("button", { name: "Bath 1" }), { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: /Bank 1 · A1/ })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("button", { name: /Bank 1 · A1/ }), { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: "Bath 1" })).toHaveFocus();
    expect(document.querySelector("dialog p[id$='-place-subtitle']")).toHaveTextContent("Sam Reyes · 10:00 AM · with Alex · (602) 555-0199");
    expect(screen.getByText(/^Full Groom, Nail Trim/)).toHaveTextContent(/^Full Groom, Nail Trim · ready around \d{1,2}:[0-5][05] [AP]M$/);
    expect(dialogLine("Also approved: Jamie Reyes")).toBeInTheDocument();
    expect(dialogLine("Offer: Spring nails, code NAILS10")).toBeInTheDocument();
    expect(dialogLine("Reward ready: A free nail trim × 2")).toBeInTheDocument();
    expect(dialogLine("Quoted as Large · 58 lb on record · Rate: Legacy 2015")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Check in Luna" })).toHaveAttribute("data-stop");
    // Enter on the warnings it opened on hands the focus to the booked bath, not a placement.
    const warned = document.querySelector<HTMLElement>("[id$='-place-warnings']")!;
    warned.focus();
    fireEvent.keyDown(warned, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Bath 1" })).toHaveFocus();
    // The booked bath leads the list, ahead of the kennels that normally come first.
    const groups = [...screen.getByRole("dialog", { name: "Check in Luna" }).querySelectorAll("[data-kind][data-order]")];
    expect(groups.map((group) => group.getAttribute("data-kind"))).toEqual(["bath", "kennel", "grooming"]);
    expect(screen.getByText("Keep the ears long")).toBeInTheDocument();
    expect(dialogLine("Last time: #7 blade · oatmeal")).toBeInTheDocument();
    expect(dialogLine(/^Also due today:/)).toHaveTextContent("Also due today: Max");
    expect(screen.getByRole("link", { name: "(602) 555-0199" })).toHaveAttribute("href", "tel:6025550199");
    expect(screen.getByRole("link", { name: "Open visit" })).toHaveAttribute("href", "/staff/appointments/next1");
    expect(screen.getByText("Kennels · booked with a kennel")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Check in Luna" })).toHaveAccessibleDescription(/Bite history.*Rabies: lapsed/);
    expect(screen.getByRole("list", { name: "Before handling Luna" })).toHaveTextContent("Rabies: lapsed");
    expect(assign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bath 1" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("next1", "station:bath1"));
    expect(await screen.findByText("Luna checked in and assigned to Bath 1 · east tub")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Waiting, / }));
    // A waiting pet opens the same modal, kennel banks included.
    fireEvent.click(screen.getByRole("button", { name: "Place this pet" }));
    expect(screen.getByRole("dialog", { name: "Place Fido" })).toBeInTheDocument();
    expect(screen.queryByText("⚠ Bite history")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Before handling Fido" })).toHaveTextContent("allergy:chicken <b>not markup</b>");
    expect(screen.getByRole("link", { name: "(602) 555-0100" })).toHaveAttribute("href", "tel:6025550100");
    expect(screen.getByRole("button", { name: /Bank 1 · A1/ })).toBeInTheDocument();
    // Inside the box (jsdom's rect is all zeros) is not the backdrop; outside is.
    const placeDialog = screen.getByRole("dialog", { name: "Place Fido" });
    fireEvent.click(placeDialog, { clientX: 0, clientY: 0 });
    expect(placeDialog).toHaveAttribute("open");
    fireEvent.click(placeDialog, { clientX: 50, clientY: 50 });
    expect(placeDialog).not.toHaveAttribute("open");
  });

  it("finds an arrival by pet or owner once the morning is busy", () => {
    const arrivals = Array.from({ length: 9 }, (_, index) => ({
      id: `a${index}`, petName: index === 4 ? "Biscuit" : `Pet ${index}`, ownerName: index === 7 ? "Jo Park" : "Sam Reyes", ownerPhone: index === 2 ? "(480) 555-7788" : null, alternates: index === 5 ? ["Dana Walker"] : [], breed: index === 3 ? "Goldendoodle" : null, arrivalTime: "9:00 AM", assignedTo: "Alex",
    }));
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} arrivals={arrivals} assign={vi.fn()}
      destinations={[{ value: "station:bath1", label: "Bath 1", kind: "bath" }]} />);
    fireEvent.click(screen.getByRole("tab", { name: /Waiting/ }));
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByRole("searchbox", { name: "Find an arrival" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.input(screen.getByRole("searchbox", { name: "Find an arrival" }), { target: { value: "bisc" } });
    expect(screen.getByRole("link", { name: /Biscuit/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Biscuit/ }).closest("li")).toHaveAttribute("data-only");
    expect(screen.getByRole("link", { name: /Pet 0/, hidden: true })).not.toBeVisible();
    fireEvent.input(screen.getByRole("searchbox", { name: "Find an arrival" }), { target: { value: "park" } });
    expect(screen.getByRole("link", { name: /Pet 7/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Biscuit/, hidden: true })).not.toBeVisible();
    expect(screen.queryByText("No arrival today matches that name.")).not.toBeInTheDocument();
    fireEvent.input(screen.getByRole("searchbox", { name: "Find an arrival" }), { target: { value: "dana" } });
    expect(screen.getByRole("link", { name: /Pet 5/ })).toBeVisible();
    fireEvent.input(screen.getByRole("searchbox", { name: "Find an arrival" }), { target: { value: "doodle" } });
    expect(screen.getByRole("link", { name: /Pet 3/ })).toBeVisible();
    fireEvent.input(screen.getByRole("searchbox", { name: "Find an arrival" }), { target: { value: "555-77" } });
    expect(screen.getByRole("link", { name: /Pet 2/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Pet 7/, hidden: true })).not.toBeVisible();
    fireEvent.input(screen.getByRole("searchbox", { name: "Find an arrival" }), { target: { value: "park" } });
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Find an arrival" }), { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Check in Pet 7" })).toHaveAttribute("open");
    fireEvent.input(screen.getByRole("searchbox", { name: "Find an arrival", hidden: true }), { target: { value: "zzz" } });
    expect(screen.getByText(/^No arrival today matches that name\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search all customers", hidden: true })).toHaveAttribute("href", "/staff/customers?q=zzz");
    fireEvent.input(screen.getByRole("searchbox", { name: "Find an arrival", hidden: true }), { target: { value: "999-01" } });
    expect(screen.getByText(/^No arrival today matches that number\./)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Find an arrival", hidden: true }), { key: "Escape" });
    expect(screen.getByRole("searchbox", { name: "Find an arrival", hidden: true })).toHaveValue("");
    expect(screen.queryByText(/^No arrival today matches/)).not.toBeInTheDocument();
  });

  it("moves from one pet to the next of the same household inside the dialog", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()}
      destinations={[{ value: "station:bath1", label: "Bath 1", kind: "bath" }]}
      arrivals={[
        { id: "h1", petName: "Luna", ownerName: "Sam Reyes", arrivalTime: "9:00 AM", assignedTo: "Alex", household: [{ id: "h2", name: "Max" }] },
        { id: "h2", petName: "Max", ownerName: "Sam Reyes", arrivalTime: "11:00 AM", assignedTo: "Alex", household: [{ id: "h1", name: "Luna" }] },
      ]} />);
    expect(screen.getAllByRole("link", { name: /Luna/ })[0]).toHaveTextContent("with Alex · + Max");
    fireEvent.click(screen.getByRole("button", { name: "Check in Luna" }));
    expect(screen.getByRole("dialog", { name: "Check in Luna" })).toHaveTextContent("Also due today: Max (11:00 AM)");
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(screen.getByRole("dialog", { name: "Check in Max" })).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Luna" })).toBeInTheDocument();
  });

  it("opens the next dog of a household booked together once the first is checked in", async () => {
    const luna = { id: "h1", petName: "Luna", ownerName: "Sam Reyes", arrivalTime: "9:00 AM", assignedTo: "Alex", household: [{ id: "h2", name: "Max" }], bookedMins: 60 };
    const max = { id: "h2", petName: "Max", ownerName: "Sam Reyes", arrivalTime: "9:00 AM", assignedTo: "Alex", household: [] };
    const assign = vi.fn(async () => ({ ok: true, columnKey: "bath", placedAt: "Bath 1" }));
    const destinations = [{ value: "station:bath1", label: "Bath 1", kind: "bath" as const }];
    const { rerender } = render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={assign} destinations={destinations} arrivals={[luna, max]} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in Luna" }));
    fireEvent.click(screen.getByRole("button", { name: /Bath 1/ }));
    expect(await screen.findByText("Luna checked in and assigned to Bath 1")).toBeInTheDocument();
    rerender(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={assign} destinations={destinations} arrivals={[max]} />);
    expect(screen.getByRole("dialog", { name: "Check in Max" })).toHaveAttribute("open");
    expect(screen.getByRole("dialog", { name: "Check in Max" })).toHaveTextContent(/Luna checked in at Bath 1 · ready around \d{1,2}:[0-5][05]/);
    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveAttribute("aria-selected", "true");
  });

  it("says how early or late the owner is beside the booked time", () => {
    const now = Date.now();
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]}
      arrivals={[{ id: "s1", petName: "Late", arrivalTime: "9:00 AM", assignedTo: "Alex", scheduledAt: now - 20 * 60000 },
        { id: "s2", petName: "Soon", arrivalTime: "9:30 AM", assignedTo: "Alex", scheduledAt: now + 15 * 60000 + 1000 },
        { id: "s3", petName: "Later", arrivalTime: "1:00 PM", assignedTo: "Alex", scheduledAt: now + 3 * 3600000 },
        { id: "s4", petName: "Very", arrivalTime: "7:00 AM", assignedTo: "Alex", scheduledAt: now - 95 * 60000 }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in Late" }));
    expect(screen.getByText("9:00 AM (20 min late)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check in Soon" }));
    expect(screen.getByText("9:30 AM (in 15 min)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check in Later" }));
    expect(screen.getByText("1:00 PM (3 h early)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check in Very", hidden: true }));
    expect(screen.getByText("7:00 AM (1 h 35 min late)")).toBeInTheDocument();
  });

  it("says once when nothing is free", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()}
      destinations={[{ value: "station:g1", label: "Table 1", kind: "grooming", inUse: true, freesAt: Date.now() + 3600000 },
        { value: "station:g2", label: "Table 2", kind: "grooming", inUse: true, freesAt: Date.now() + 1800000 }]}
      arrivals={[{ id: "s1", petName: "Solo", arrivalTime: "9:00 AM", assignedTo: "Alex" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in Solo" }));
    expect(screen.getByText(/^Nothing is free right now/)).toHaveTextContent(/Table 2 should be done around \d{1,2}:\d{2} [AP]M\.$/);
    expect(document.querySelector("dialog .cancel")).toHaveFocus();
  });

  it("drops the kennels to the end for a pet booked without one, unless it is well ahead of its slot", () => {
    const destinations = [{ value: "kennel:k1", label: "Bank 1", kind: "kennel" as const }, { value: "station:b1", label: "Bath 1", kind: "bath" as const }];
    const { container } = render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={destinations}
      arrivals={[{ id: "s1", petName: "Solo", arrivalTime: "9:00 AM", assignedTo: "Alex" }, { id: "s2", petName: "Stay", arrivalTime: "9:00 AM", assignedTo: "Alex", needsKennel: true },
        { id: "s3", petName: "Early", arrivalTime: "1:00 PM", assignedTo: "Alex", scheduledAt: Date.now() + 2 * 3600000 }]} />);
    const order = () => Array.from(container.querySelectorAll(".dest"), (el) => el.firstChild?.textContent);
    fireEvent.click(screen.getByRole("button", { name: "Check in Solo" }));
    expect(order()).toEqual(["Bath 1", "Bank 1"]);
    fireEvent.click(screen.getByRole("button", { name: "Check in Stay" }));
    expect(order()).toEqual(["Bank 1", "Bath 1"]);
    fireEvent.click(screen.getByRole("button", { name: "Check in Early", hidden: true }));
    expect(order()).toEqual(["Bank 1", "Bath 1"]);
    expect(screen.getByText("Kennels · early, waits here first")).toBeInTheDocument();
  });

  it("folds the reference lines under More, and draws no More when there are none", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} arrivals={[
      { id: "a1", petName: "Luna", ownerName: "Sam Reyes", arrivalTime: "9:00 AM", assignedTo: "Alex", lastGroom: "#7 blade" },
      { id: "a2", petName: "Max", ownerName: "Sam Reyes", arrivalTime: "9:00 AM", assignedTo: "Alex" },
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in Luna" }));
    const more = screen.getByText("More · Last time").closest("details")!;
    expect(more).not.toHaveAttribute("open");
    expect(more).toHaveTextContent("Last time: #7 blade");
    fireEvent.click(screen.getByRole("button", { name: "Check in Max", hidden: true }));
    expect(more).toHaveAttribute("hidden");
  });

  it("marks an unassigned arrival in the dialog, and not an assigned one", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} arrivals={[
      { id: "a1", petName: "Luna", ownerName: "Sam Reyes", arrivalTime: "9:00 AM", assignedTo: "Unassigned" },
      { id: "a2", petName: "Max", ownerName: "Sam Reyes", arrivalTime: "9:00 AM", assignedTo: "Alex" },
    ]} />);
    expect(screen.getByText("Unassigned", { selector: "li span" })).toHaveAttribute("data-none");
    fireEvent.click(screen.getByRole("button", { name: "Check in Luna" }));
    expect(screen.getByText("Unassigned", { selector: "dialog span" })).toHaveAttribute("data-none");
    fireEvent.click(screen.getByRole("button", { name: "Check in Max", hidden: true }));
    expect(screen.getByText("with Alex", { selector: "dialog span" })).not.toHaveAttribute("data-none");
  });

  it("keeps an open check-in open through the minute's refresh", () => {
    const arrivals = [{ id: "a1", petName: "Luna", ownerName: "Sam Reyes", arrivalTime: "9:00 AM", assignedTo: "Alex" }];
    const { rerender } = render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} arrivals={arrivals} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in Luna" }));
    rerender(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} arrivals={[...arrivals]} />);
    expect(screen.getByRole("dialog", { name: "Check in Luna" })).toHaveAttribute("open");
  });

  it("keeps the More fold open through the minute's refresh", () => {
    const arrivals = [{ id: "a1", petName: "Luna", ownerName: "Sam Reyes", arrivalTime: "9:00 AM", assignedTo: "Alex", lastGroom: "#7 blade" }];
    const { rerender } = render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} arrivals={arrivals} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in Luna" }));
    screen.getByText("More · Last time").closest("details")!.open = true;
    rerender(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} arrivals={[...arrivals]} />);
    expect(screen.getByText("More · Last time").closest("details")).toHaveAttribute("open");
  });

  it("keeps a half-typed search through the minute's refresh", () => {
    const arrivals = Array.from({ length: 10 }, (_, index) => ({ id: `a${index}`, petName: `Pet ${index}`, ownerName: "Someone", arrivalTime: "9:00 AM", assignedTo: "Alex" }));
    const { rerender } = render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} arrivals={arrivals} />);
    fireEvent.input(screen.getByRole("searchbox", { name: "Find an arrival" }), { target: { value: "pet 3" } });
    rerender(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} arrivals={[...arrivals]} />);
    expect(screen.getByRole("searchbox", { name: "Find an arrival" })).toHaveValue("pet 3");
    expect(screen.getByText(/to find an arrival/)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Find an arrival" }), { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: "Check in Pet 3" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("button", { name: "Check in Pet 3" }), { key: "ArrowUp" });
    expect(screen.getByRole("searchbox", { name: "Find an arrival" })).toHaveFocus();
    expect(screen.getByRole("link", { name: /Pet 7/, hidden: true })).not.toBeVisible();
  });

  it("names the breed ahead of the owner in the check-in dialog", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} arrivals={[
      { id: "a1", petName: "Luna", ownerName: "Sam Reyes", breed: "Poodle", arrivalTime: "9:00 AM", assignedTo: "Alex" },
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in Luna" }));
    expect(screen.getByRole("dialog", { name: "Check in Luna" })).toHaveTextContent("Poodle · Sam Reyes · 9:00 AM");
  });

  it("recesses arrivals booked over an hour out", () => {
    const now = Date.now();
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} arrivals={[
      { id: "soon", petName: "Luna", ownerName: "Sam Reyes", arrivalTime: "9:00 AM", assignedTo: "Alex", scheduledAt: now + 600000 },
      { id: "later", petName: "Max", ownerName: "Sam Reyes", arrivalTime: "11:00 AM", assignedTo: "Alex", scheduledAt: now + 7200000 },
    ]} />);
    expect(screen.getAllByTitle("Check in Luna")[0].closest("li")).not.toHaveAttribute("data-later");
    expect(screen.getAllByTitle("Check in Max")[0].closest("li")).toHaveAttribute("data-later");
    expect(screen.getByText(/2 awaiting check-in · 1 due within the hour/)).toBeInTheDocument();
  });

  it("opens the first dog when a search finds only one household", () => {
    const arrivals = Array.from({ length: 10 }, (_, index) => ({ id: `a${index}`, petName: `Pet ${index}`, ownerName: "Someone Else", arrivalTime: "9:00 AM", assignedTo: "Alex" }));
    arrivals[3] = { ...arrivals[3], petName: "Luna", ownerName: "Sam Reyes", household: [{ id: "a4", name: "Max" }] } as typeof arrivals[number];
    arrivals[4] = { ...arrivals[4], petName: "Max", ownerName: "Sam Reyes", household: [{ id: "a3", name: "Luna" }] } as typeof arrivals[number];
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} arrivals={arrivals} />);
    const find = screen.getByRole("searchbox", { name: "Find an arrival" });
    fireEvent.input(find, { target: { value: "reyes" } });
    expect(screen.getByText("2 of 10 arrivals · Enter checks in Luna")).toBeInTheDocument();
    fireEvent.keyDown(find, { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Check in Luna" })).toHaveAttribute("open");
  });

  it("finds an accented name typed without its accent", () => {
    const arrivals = Array.from({ length: 10 }, (_, index) => ({ id: `a${index}`, petName: `Pet ${index}`, ownerName: "Someone Else", arrivalTime: "9:00 AM", assignedTo: "Alex" }));
    arrivals[2] = { ...arrivals[2], petName: "Zoë", ownerName: "Renée Côté" };
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} arrivals={arrivals} />);
    fireEvent.input(screen.getByRole("searchbox", { name: "Find an arrival" }), { target: { value: "cote" } });
    expect(screen.getByText("1 of 10 arrivals · Enter checks in Zoë")).toBeInTheDocument();
  });

  it("sorts a taken table after the free ones in its group", () => {
    const grooming = [{ value: "station:g1", label: "Table 1", kind: "grooming" as const, inUse: true }, { value: "station:g2", label: "Table 2", kind: "grooming" as const }];
    const { container } = render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={grooming} arrivals={[{ id: "s1", petName: "Solo", arrivalTime: "9:00 AM", assignedTo: "Alex" }]} />);
    expect(Array.from(container.querySelectorAll(".dest"), (el) => el.firstChild?.textContent)).toEqual(["Table 2", "Table 1"]);
  });

  it("puts the booked table first in its group, and gives the next pet the shop's order back", () => {
    const grooming = [{ value: "station:g1", label: "Table 1", kind: "grooming" as const }, { value: "station:g2", label: "Table 2", kind: "grooming" as const }];
    const { container } = render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={grooming}
      arrivals={[{ id: "s1", petName: "Solo", arrivalTime: "9:00 AM", assignedTo: "Alex", suggested: "station:g2" }, { id: "s2", petName: "Pip", arrivalTime: "9:30 AM", assignedTo: "Alex" }]} />);
    const order = () => Array.from(container.querySelectorAll(".dest"), (el) => el.firstChild?.textContent);
    fireEvent.click(screen.getByRole("button", { name: "Check in Solo" }));
    expect(order()).toEqual(["Table 2", "Table 1"]);
    fireEvent.click(screen.getByRole("button", { name: "Check in Pip" }));
    expect(order()).toEqual(["Table 1", "Table 2"]);
  });

  it("places with a number key, skipping the tables in use", async () => {
    const destinations = [
      { value: "station:bath1", label: "Bath 1", kind: "bath" as const, inUse: true },
      { value: "station:bath2", label: "Bath 2", kind: "bath" as const },
      { value: "station:g1", label: "Table 1", kind: "grooming" as const },
    ];
    const assign = vi.fn(async () => ({ ok: true, columnKey: "grooming", placedAt: "Table 1" }));
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={assign} destinations={destinations} arrivals={[{ id: "n1", petName: "Nala", arrivalTime: "9:00 AM", assignedTo: "Alex" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in Nala" }));
    expect(screen.getByRole("button", { name: /Table 1/ })).toHaveAttribute("aria-keyshortcuts", "2");
    expect(screen.getByRole("button", { name: /Bath 1/ })).not.toHaveAttribute("aria-keyshortcuts");
    fireEvent.keyDown(screen.getByRole("button", { name: /Bath 2/ }), { key: "2" });
    await screen.findByText("Nala checked in and assigned to Table 1");
    expect(assign).toHaveBeenCalledWith("n1", "station:g1");
  });

  it("lights the card just checked in once, on the redrawn board", async () => {
    const luna = { id: "h1", petName: "Luna", arrivalTime: "9:00 AM", assignedTo: "Alex" };
    const assign = vi.fn(async () => ({ ok: true, columnKey: "bath", placedAt: "Bath 1" }));
    const destinations = [{ value: "station:bath1", label: "Bath 1", kind: "bath" as const }];
    const { rerender } = render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={assign} destinations={destinations} arrivals={[luna]} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in Luna" }));
    fireEvent.click(screen.getByRole("button", { name: /Bath 1/ }));
    await screen.findByText("Luna checked in and assigned to Bath 1");
    const placed: BoardPet = { id: "h1", petName: "Luna", ownerName: "Sam Reyes", columnKey: "bath", stationName: "Bath 1", hasBiteHistory: false };
    rerender(<FloorBoard pets={[...PETS, placed]} capacity={{}} move={vi.fn()} assign={assign} destinations={destinations} arrivals={[]} />);
    expect(document.querySelectorAll("li[data-placed]")).toHaveLength(1);
    expect(document.querySelector("li[data-placed]")).toHaveTextContent("Luna");
    rerender(<FloorBoard pets={[...PETS, placed]} capacity={{}} move={vi.fn()} assign={assign} destinations={destinations} arrivals={[]} />);
    expect(document.querySelector("li[data-placed]")).toBeNull();
  });

  it("returns to the search after a check-in found through it", async () => {
    const arrivals = Array.from({ length: 10 }, (_, index) => ({ id: `a${index}`, petName: index === 4 ? "Biscuit" : `Pet ${index}`, arrivalTime: "9:00 AM", assignedTo: "Alex" }));
    const assign = vi.fn(async () => ({ ok: true, columnKey: "bath", placedAt: "Bath 1" }));
    const destinations = [{ value: "station:bath1", label: "Bath 1", kind: "bath" as const }];
    const { rerender } = render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={assign} destinations={destinations} arrivals={arrivals} />);
    fireEvent.input(screen.getByRole("searchbox", { name: "Find an arrival" }), { target: { value: "bisc" } });
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Find an arrival" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /Bath 1/ }));
    expect(await screen.findByText("Biscuit checked in and assigned to Bath 1")).toBeInTheDocument();
    rerender(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={assign} destinations={destinations} arrivals={arrivals.filter((entry) => entry.id !== "a4")} />);
    expect(screen.getByRole("searchbox", { name: "Find an arrival" })).toHaveFocus();
    expect(screen.getByText("Biscuit checked in at Bath 1")).toHaveAttribute("data-done");
    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveAttribute("aria-selected", "true");
  });

  it("says why a kennel bank leads when a household dog is already behind one of its doors", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()}
      destinations={[{ value: "kennelbank:b1", label: "Kennel Bank 1", kind: "kennel", note: "2 of 6 doors empty" }]}
      arrivals={[{ id: "h2", petName: "Max", arrivalTime: "9:00 AM", assignedTo: "Alex", needsKennel: true, suggested: "kennelbank:b1", suggestedReason: "With Luna" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in Max" }));
    expect(screen.getByRole("button", { name: /Kennel Bank 1/ })).toHaveAttribute("data-reason", "With Luna");
  });

  it("keeps a late arrival's colour on the time inside the dialog", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]}
      arrivals={[{ id: "l1", petName: "Luna", ownerName: "Dana", arrivalTime: "9:00 AM", assignedTo: "Alex", flags: [{ label: "Late", severity: "warning" }] }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in Luna" }));
    const subtitle = document.querySelector("dialog p[id$='-place-subtitle']")!;
    expect(subtitle).toHaveTextContent("Dana · 9:00 AM · with Alex");
    expect(subtitle.querySelector("[data-severity='warning']")).toHaveTextContent("9:00 AM");
  });

  it("opens the check-in from a tap on the arrival card", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]}
      arrivals={[{ id: "t1", petName: "Luna", arrivalTime: "9:00 AM", assignedTo: "Alex" }]} />);
    fireEvent.click(screen.getByRole("link", { name: /Luna/ }), { detail: 1 });
    expect(screen.getByRole("heading", { name: "Check in Luna" })).toBeInTheDocument();
  });

  it("says when the booked groom runs past closing", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]} closesAt={Date.now() + 30 * 60_000}
      arrivals={[{ id: "c1", petName: "Luna", arrivalTime: "4:00 PM", assignedTo: "Alex", bookedMins: 90 }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in Luna" }));
    expect(screen.getByText(/ready around .*, after closing/)).toHaveAttribute("data-late");
  });

  it("says where the rest of the household already is", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={vi.fn()} destinations={[]}
      arrivals={[{ id: "s1", petName: "Luna", arrivalTime: "9:00 AM", assignedTo: "Alex", inShop: ["Max at Bath 1"] }]} />);
    expect(screen.getByRole("link", { name: /Luna/ })).toHaveTextContent("Family here");
    fireEvent.click(screen.getByRole("button", { name: "Check in Luna" }));
    expect(dialogLine("Already here: Max at Bath 1")).toBeInTheDocument();
  });

  it("shows an assignment refusal without changing tabs", async () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()}
      assign={vi.fn(async () => ({ ok: false, error: "Bath 1 is already taken." }))}
      destinations={[{ value: "station:bath1", label: "Bath 1", kind: "bath" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Place this pet" }));
    fireEvent.click(screen.getByRole("button", { name: "Bath 1" }));
    // The dialog comes back with the reason in it, ready for another choice.
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Place Fido" })).toHaveAttribute("open"));
    expect(screen.getByRole("dialog", { name: "Place Fido" })).toContainElement(screen.getByRole("alert"));
    expect(screen.getByRole("alert")).toHaveTextContent("Bath 1 is already taken.");
    expect(screen.getByRole("button", { name: /Bath 1/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Bath 1/ })).toHaveTextContent("Unavailable");
    expect(screen.getByRole("tab", { name: /Waiting, / })).toHaveAttribute("aria-selected", "true");
  });

});
