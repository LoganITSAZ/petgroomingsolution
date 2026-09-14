// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DateJump from "./DateJump";

/* The whole point of the component: a click anywhere on the readable date opens
   the browser's calendar. Clicking the invisible field alone does not — which is
   the bug this replaced — so showPicker() is what the test watches. jsdom has no
   implementation of it, so it is stubbed. */
function renderJump() {
  render(
    <DateJump
      name="date"
      defaultValue="2026-09-24"
      ariaLabel="Jump to date"
      label="Wednesday, September 24"
      widthClass="w-56"
    />
  );
  const input = screen.getByLabelText("Jump to date") as HTMLInputElement;
  const showPicker = vi.fn();
  input.showPicker = showPicker;
  return { input, showPicker };
}

describe("DateJump", () => {
  it("opens the picker on click", () => {
    const { input, showPicker } = renderJump();
    fireEvent.click(input);
    expect(showPicker).toHaveBeenCalled();
  });

  it("opens the picker from the keyboard instead of submitting", () => {
    const { input, showPicker } = renderJump();
    const event = fireEvent.keyDown(input, { key: "Enter" });
    expect(showPicker).toHaveBeenCalled();
    // preventDefault, so Enter does not post the form with the date unchanged.
    expect(event).toBe(false);
  });

  it("survives a browser with no picker", () => {
    const { input } = renderJump();
    input.showPicker = () => {
      throw new Error("NotAllowedError");
    };
    expect(() => fireEvent.click(input)).not.toThrow();
  });
});
