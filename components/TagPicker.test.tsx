// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import TagPicker from "./TagPicker";

/** The hidden inputs are what the server actually reads. */
function posted(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="healthFlags"]')
  ).map((input) => input.value);
}

function Field() {
  return (
    <form>
      <TagPicker
        name="healthFlags"
        options={[{ id: "elderly", label: "elderly" }]}
        initialIds={["allergy:chicken"]}
        optionsLabel="Common flags"
        noun="health flag"
        required={false}
        allowCustom
        customPlaceholder="Type a flag"
      />
    </form>
  );
}

describe("TagPicker with allowCustom", () => {
  it("keeps a custom value it was given, and adds typed ones as chips", () => {
    const { container } = render(<Field />);
    expect(posted(container)).toEqual(["allergy:chicken"]);

    const input = screen.getByPlaceholderText("Type a flag");
    fireEvent.change(input, { target: { value: " reactive " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(posted(container)).toEqual(["allergy:chicken", "reactive"]);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("ignores a repeat whatever its case, and drops nothing on submit", () => {
    const { container } = render(<Field />);
    const input = screen.getByPlaceholderText("Type a flag");

    fireEvent.change(input, { target: { value: "Allergy:Chicken" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(posted(container)).toEqual(["allergy:chicken"]);

    // Saving with text still in the box must not lose it.
    fireEvent.change(input, { target: { value: "arthritis" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(posted(container)).toEqual(["allergy:chicken", "arthritis"]);
  });

  it("removes a chip", () => {
    const { container } = render(<Field />);
    fireEvent.click(screen.getByLabelText("Remove allergy:chicken health flag"));
    expect(posted(container)).toEqual([]);
  });

  it("moves a clicked option into the field and stops offering it", () => {
    const { container } = render(<Field />);
    fireEvent.click(screen.getByLabelText("Add elderly health flag"));

    expect(posted(container)).toEqual(["allergy:chicken", "elderly"]);
    expect(screen.queryByLabelText("Add elderly health flag")).not.toBeInTheDocument();

    // Taking it off puts it back on offer.
    fireEvent.click(screen.getByLabelText("Remove elderly health flag"));
    expect(screen.getByLabelText("Add elderly health flag")).toBeInTheDocument();
  });

  it("offers an option again once a typed duplicate of it is removed", () => {
    render(<Field />);
    const input = screen.getByPlaceholderText("Type a flag");
    fireEvent.change(input, { target: { value: "Elderly" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.queryByLabelText("Add elderly health flag")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Remove Elderly health flag"));
    expect(screen.getByLabelText("Add elderly health flag")).toBeInTheDocument();
  });
});
