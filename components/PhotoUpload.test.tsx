// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { axe } from "jest-axe";
import PhotoUpload from "./PhotoUpload";

describe("PhotoUpload", () => {
  it("accepts a valid dropped image and shows it is ready", () => {
    render(
      <PhotoUpload
        action={vi.fn()}
        idField="customerId"
        idValue="customer-1"
        currentUrl={null}
        label="Fido"
      />
    );

    const file = new File(["hello"], "fido.png", { type: "image/png" });
    const dropTarget = screen.getByLabelText("Add photo").closest("label");

    fireEvent.dragOver(dropTarget!, {
      dataTransfer: {
        files: [file],
          types: ["Files"],
            dropEffect: "copy",
      },
    });
    fireEvent.drop(dropTarget!, {
      dataTransfer: {
        files: [file],
          types: ["Files"],
            dropEffect: "copy",
      },
    });

    expect(screen.getByText("Ready to upload")).toBeInTheDocument();
    expect((screen.getByLabelText("Change") as HTMLInputElement).files?.[0]).toBe(file);
  });

  /* The input was `hidden` — `display:none` — which took it out of the tab
     order and left the label around it unfocusable, so there was no keyboard
     route to a photo at all. It has to stay off-screen rather than gone. */
  it("keeps the file input reachable by keyboard", () => {
    render(
      <PhotoUpload
        action={vi.fn()}
        idField="customerId"
        idValue="customer-1"
        currentUrl={null}
        label="Fido"
      />
    );

    const input = screen.getByLabelText("Add photo");
    expect(input).not.toHaveClass("hidden");
    input.focus();
    expect(input).toHaveFocus();
  });

  /* `toHaveNoViolations` has been registered in vitest.setup.ts since the
     matcher was installed and nothing has ever called it. This is the first
     one; axe checks the computed accessibility tree, which is where a control
     with no name or no route to it shows up. */
  it("has no axe violations", async () => {
    const { container } = render(
      <PhotoUpload
        action={vi.fn()}
        idField="customerId"
        idValue="customer-1"
        currentUrl={null}
        label="Fido"
      />
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("rejects a dropped file that is not a supported image", () => {
    render(
      <PhotoUpload
        action={vi.fn()}
        idField="customerId"
        idValue="customer-1"
        currentUrl={null}
        label="Fido"
      />
    );

    const invalid = new File(["hello"], "notes.pdf", { type: "application/pdf" });
    const dropTarget = screen.getByLabelText("Add photo").closest("label");

    fireEvent.drop(dropTarget!, {
      dataTransfer: {
        files: [invalid],
          types: ["Files"],
            dropEffect: "none",
      },
    });

    expect(screen.getByText("Use a JPG, PNG or WebP image under 2 MB.")).toBeInTheDocument();
  });
});
