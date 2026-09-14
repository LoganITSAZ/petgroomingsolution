// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import BrandColorField from "./BrandColorField";
import { THEME_PRESETS, shopColorsFromForm, colorsFromTokens } from "@/lib/themes";

afterEach(cleanup);

it("edits labeled colors, previews them, and submits all template roles", () => {
  const { container } = render(<form><BrandColorField initialTokens={THEME_PRESETS[0].tokens} shopName="Test Groomer" /></form>);
  expect(screen.getAllByRole("textbox")).toHaveLength(13);
  fireEvent.change(screen.getByLabelText("Pick footer background color"), { target: { value: "#123456" } });
  expect(screen.getByLabelText("Footer background")).toHaveValue("#123456");
  expect(screen.getByText("Hours · Contact · Test Groomer")).toHaveStyle({ backgroundColor: "rgb(18, 52, 86)" });
  expect(shopColorsFromForm(new FormData(container.querySelector("form")!))?.footerBg).toBe("#123456");
  fireEvent.click(screen.getByLabelText("Preview dark mode"));
  expect(screen.getByText("Hours · Contact · Test Groomer")).toHaveStyle({ backgroundColor: "rgb(19, 18, 17)" });
  expect(screen.getByLabelText("Footer background")).toHaveValue("#123456");
});

it("copies a complete template palette without submitting the form", () => {
  const { container } = render(<form><BrandColorField initialTokens={THEME_PRESETS[0].tokens} shopName="Test Groomer" /></form>);
  fireEvent.change(screen.getByLabelText("Start from a template"), { target: { value: "christmas" } });
  const copy = screen.getByRole("button", { name: "Copy template colors" });
  expect(copy).toHaveAttribute("type", "button");
  fireEvent.click(copy);
  expect(shopColorsFromForm(new FormData(container.querySelector("form")!))).toEqual(
    colorsFromTokens(THEME_PRESETS.find(preset => preset.id === "christmas")!.tokens),
  );
});
