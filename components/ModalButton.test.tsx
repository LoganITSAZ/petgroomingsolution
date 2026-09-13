// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeAll, describe, expect, it } from "vitest";
import { axe } from "jest-axe";
import ModalButton from "./ModalButton";

function Dialog() {
  return (
    <ModalButton label="Add a service" title="Add a service" description="Name it and price it.">
      <form>
        <label htmlFor="service-name">Name</label>
        <input id="service-name" name="name" />
      </form>
    </ModalButton>
  );
}

describe("ModalButton", () => {
  beforeAll(() => {
    /* jsdom does not implement the modal half of <dialog> — showModal() and
       close() are missing, and `open` is never set. The focus trap and Escape
       are the browser's job and not what these tests are for; this is only
       enough for the component to mount and toggle. */
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    };
  });

  it("names the dialog with its own heading", () => {
    render(<Dialog />);
    fireEvent.click(screen.getByRole("button", { name: "Add a service" }));

    expect(screen.getByRole("dialog", { name: "Add a service" })).toBeInTheDocument();
  });

  it("gives the close control a name, not just a glyph", () => {
    render(<Dialog />);
    fireEvent.click(screen.getByRole("button", { name: "Add a service" }));

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("has no axe violations while open", async () => {
    const { container } = render(<Dialog />);
    fireEvent.click(screen.getByRole("button", { name: "Add a service" }));

    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});
