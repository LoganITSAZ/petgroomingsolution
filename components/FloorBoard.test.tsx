// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { axe } from "jest-axe";
import FloorBoard, { type BoardPet } from "./FloorBoard";

// The board is a client component that refreshes the server render after a
// move; nothing here exercises that, it only has to exist.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

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
    expect(screen.getByRole("button", { name: /Mochi/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Move here" })).toHaveLength(5);
  });

  it("names each stage column so the regions are told apart", () => {
    render(<Board />);

    expect(screen.getByRole("region", { name: "Waiting" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Grooming Table" })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<Board />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("announces the move politely rather than firing an alert", async () => {
    render(<Board />);
    fireEvent.click(screen.getByRole("button", { name: /Fido/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Move here" })[3]);

    const live = await screen.findByText(/Fido/, { selector: "[aria-live='polite']" });
    expect(live).toHaveClass("sr-only");
  });
});
