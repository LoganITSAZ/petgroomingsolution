// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import ResourceLibrary from "./ResourceLibrary";
import { RESOURCE_SECTIONS } from "@/lib/resources";

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
const renderLibrary = () =>
  render(<ResourceLibrary sections={RESOURCE_SECTIONS} breedCount={12} />);

describe("resource hub", () => {
  it("filters references and opens the matching entry in a reader", () => {
    renderLibrary();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "#4f" },
    });
    expect(screen.getByText("1 references · 1 topics")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "#4F" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { level: 2, name: "#4F" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Next reference →" }),
    );
    expect(
      within(dialog).getByRole("heading", { level: 2, name: "#5F" }),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("persists saved references and removes them from the saved view", () => {
    const view = renderLibrary();
    fireEvent.click(screen.getByRole("button", { name: "#4F" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "☆ Save",
      }),
    );
    view.unmount();
    renderLibrary();
    fireEvent.click(screen.getByRole("tab", { name: "Saved (1)" }));
    expect(screen.getByRole("button", { name: "#4F ★" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "#5F" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "#4F ★" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "★ Saved" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(
      screen.getByText("Your go-to references, in one place"),
    ).toBeInTheDocument();
  });
  it("supports keyboard tabs and calculates a total-volume dilution", () => {
    renderLibrary();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Library" }), {
      key: "End",
    });
    expect(screen.getByRole("tab", { name: "Quick tools" })).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Water parts per 1 concentrate"), {
      target: { value: "9" },
    });
    expect(screen.getByText("50 mL")).toBeInTheDocument();
    expect(screen.getByText("450 mL")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Total mixture (mL)"), {
      target: { value: "" },
    });
    expect(
      screen.getByText(
        "Enter a positive ratio and total volume to calculate your mix.",
      ),
    ).toBeInTheDocument();
  });
});
