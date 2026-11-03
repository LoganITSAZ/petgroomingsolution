// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { axe } from "jest-axe";
import BiteHistoryIndicator from "./BiteHistoryIndicator";

it("explains the warning on hover, keyboard focus and tap, and dismisses it", async () => {
  const { container } = render(<BiteHistoryIndicator petName="Pepper" />);
  const button = screen.getByRole("button", { name: "Pepper: bite history recorded" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseEnter(button);
  expect(screen.getByRole("tooltip").textContent).toBe("Bite history recorded");
  fireEvent.mouseLeave(button);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(button);
  expect(button.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
  fireEvent.keyDown(button, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.click(button);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  expect((await axe(container)).violations).toEqual([]);
  fireEvent.blur(button);
  expect(screen.queryByRole("tooltip")).toBeNull();
});
