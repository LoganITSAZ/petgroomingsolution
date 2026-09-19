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

describe("FloorBoard", () => {
  /* HTML5 drag-and-drop does not exist on a touchscreen or a keyboard, so the
     tap path is the accessible one: every chip and every "Move here" is a real
     <button>, reachable by Tab. If jQuery ever builds these as divs the board
     becomes mouse-only on half the shop's screens. */
  it("builds every pet and every destination as a real button", () => {
    render(<Board />);

    expect(screen.getByRole("button", { name: /Fido/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Bath/ }));
    expect(screen.getByRole("button", { name: /Mochi/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Mochi/ }));
    expect(screen.getByRole("button", { name: "Move here" })).toBeInTheDocument();
  });

  it("shows one labeled panel and supports keyboard tab navigation", () => {
    render(<Board />);

    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel", { name: /Waiting, / })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: /Waiting, / }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Bath/ })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: /Bath/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fido/ })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: /Bath/ }), { key: "End" });
    expect(screen.getByRole("tab", { name: /Waiting Pickup/ })).toHaveAttribute("aria-selected", "true");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Board />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("announces the move politely rather than firing an alert", async () => {
    render(<Board />);
    fireEvent.click(screen.getByRole("button", { name: /Fido/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Grooming Table/ }));
    fireEvent.click(screen.getByRole("button", { name: "Move here" }));

    const live = await screen.findByText("Fido moved to Grooming Table", { selector: "[aria-live='polite']" });
    expect(live).toHaveClass("sr-only");
    expect(screen.getByRole("tabpanel", { name: /Grooming Table, 1 pets/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fido/ })).toBeInTheDocument();
  });
  it("moves a pet by dropping onto a destination tab", async () => {
    const move = vi.fn(async () => ({ ok: true }));
    render(<FloorBoard pets={PETS} capacity={{}} move={move} />);
    fireEvent.drop(screen.getByRole("tab", { name: /Drying/ }), {
      dataTransfer: { getData: () => "a1" },
    });
    await waitFor(() => expect(move).toHaveBeenCalledWith("a1", "drying"));
    expect(await screen.findByText("Fido moved to Drying")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Drying/ })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the active tab when server data refreshes", () => {
    const move = vi.fn(async () => ({ ok: true }));
    const { rerender } = render(<FloorBoard pets={PETS} capacity={{}} move={move} />);
    fireEvent.click(screen.getByRole("tab", { name: /Bath/ }));
    rerender(<FloorBoard pets={[...PETS]} capacity={{}} move={move} />);
    expect(screen.getByRole("tab", { name: /Bath/ })).toHaveAttribute("aria-selected", "true");
  });

  it("includes arrivals in the lifecycle without making them a move destination", async () => {
    const move = vi.fn(async () => ({ ok: true }));
    const { container } = render(<FloorBoard pets={PETS} capacity={{}} move={move} arrivals={[
      { id: "next1", petName: "Luna", arrivalTime: "10:00 AM", assignedTo: "Alex", overdue: true },
    ]} />);
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByRole("tabpanel", { name: /Arrivals, 1 pets/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Luna/ })).toHaveAttribute("href", "/staff/appointments/next1");
    expect(screen.getByText("Past arrival time")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(screen.getByRole("tab", { name: /Waiting, / }));
    fireEvent.click(screen.getByRole("button", { name: /Fido/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Arrivals/ }));
    expect(screen.queryByRole("button", { name: "Move here" })).not.toBeInTheDocument();
    fireEvent.drop(screen.getByRole("tab", { name: /Arrivals/ }), { dataTransfer: { getData: () => "a1" } });
    expect(move).not.toHaveBeenCalled();
  });

  /* The shop-wide alert names every pet due a booster; this is the same fact on
     the card somebody is about to check in, which is the only moment a
     certificate can still be asked for. */
  it("carries a vaccination warning on the arrival it belongs to", () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} arrivals={[
      { id: "next1", petName: "Luna", arrivalTime: "10:00 AM", assignedTo: "Alex", overdue: false, warning: "Luna is not current on Rabies." },
      { id: "next2", petName: "Pip", arrivalTime: "11:00 AM", assignedTo: "Alex", overdue: false },
    ]} />);
    expect(screen.getByText("Luna is not current on Rabies.")).toBeVisible();
    expect(screen.getByRole("link", { name: /Pip/ })).not.toHaveTextContent("not current");
  });

  it("shows an empty arrivals tab and opens it from the dashboard shortcut", () => {
    render(<><a href="#arrivals">Arrivals left today</a><FloorBoard pets={PETS} arrivals={[]} capacity={{}} move={vi.fn()} /></>);
    expect(screen.getByText("No more arrivals scheduled today.")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: /Bath/ }));
    fireEvent.click(screen.getByRole("link", { name: "Arrivals left today" }));
    expect(screen.getByRole("tab", { name: /Arrivals/ })).toHaveAttribute("aria-selected", "true");
  });

  it("assigns arrivals and waiting pets using named destinations", async () => {
    const assign = vi.fn(async () => ({ ok: true, columnKey: "bath" }));
    const { container } = render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()} assign={assign}
      arrivals={[{ id: "next1", petName: "Luna", arrivalTime: "10:00 AM", assignedTo: "Alex", overdue: false }]}
      destinations={[{ value: "station:bath1", label: "Bath 1", kind: "bath" }, { value: "kennel:k1", label: "Bank 1 · A1", kind: "kennel" }]} />);
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.change(screen.getByRole("combobox", { name: "Assign Luna to" }), { target: { value: "station:bath1" } });
    fireEvent.click(screen.getByRole("button", { name: "Check in & assign" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("next1", "station:bath1"));
    expect(await screen.findByText("Luna assigned to Bath 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Waiting, / }));
    expect(screen.getByRole("combobox", { name: "Assign Fido to" })).toBeInTheDocument();
  });

  it("shows an assignment refusal without changing tabs", async () => {
    render(<FloorBoard pets={PETS} capacity={{}} move={vi.fn()}
      assign={vi.fn(async () => ({ ok: false, error: "Bath 1 is already taken." }))}
      destinations={[{ value: "station:bath1", label: "Bath 1", kind: "bath" }]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Assign Fido to" }), { target: { value: "station:bath1" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign station / kennel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bath 1 is already taken.");
    expect(screen.getByRole("tab", { name: /Waiting, / })).toHaveAttribute("aria-selected", "true");
  });

});
