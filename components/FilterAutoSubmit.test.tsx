// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import FilterAutoSubmit from "./FilterAutoSubmit";

/* `q` is a prop because the reload re-renders the form server-side with the
   search term already in the box — which is the state the caret has to land
   at the end of. */
function Filters({ q = "", scope }: { q?: string; scope?: string }) {
  return (
    <FilterAutoSubmit debounceMs={300} scope={scope}>
      <form>
        <input type="search" name="q" defaultValue={q} aria-label="Search" />
        <input type="date" name="on" aria-label="Date" />
        <select name="group" aria-label="Group">
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
      </form>
    </FilterAutoSubmit>
  );
}

describe("FilterAutoSubmit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    // jsdom does not implement form.requestSubmit(); stub it so the debounced
    // call has something to record without actually navigating.
    HTMLFormElement.prototype.requestSubmit = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not submit immediately while typing in search", () => {
    render(<Filters />);
    fireEvent.input(screen.getByLabelText("Search"), { target: { value: "fido" } });
    expect(HTMLFormElement.prototype.requestSubmit).not.toHaveBeenCalled();
  });

  it("submits once typing has paused", () => {
    render(<Filters />);
    fireEvent.input(screen.getByLabelText("Search"), { target: { value: "fido" } });
    vi.advanceTimersByTime(300);
    expect(HTMLFormElement.prototype.requestSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits immediately when a date is picked", () => {
    render(<Filters />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-24" } });
    expect(HTMLFormElement.prototype.requestSubmit).toHaveBeenCalledTimes(1);
  });

  /* /staff/appointments wraps only the fields, not the form. Looking for the
     form downwards alone found nothing there and auto-submit quietly did
     nothing — including when a date was picked. */
  it("finds a form it is nested inside", () => {
    render(
      <form>
        <FilterAutoSubmit debounceMs={300}>
          <input type="date" name="on" aria-label="Date" />
        </FilterAutoSubmit>
      </form>
    );
    fireEvent.input(screen.getByLabelText("Date"), { target: { value: "2026-09-24" } });
    vi.advanceTimersByTime(300);
    expect(HTMLFormElement.prototype.requestSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits immediately when a select changes", () => {
    render(<Filters />);
    fireEvent.change(screen.getByLabelText("Group"), { target: { value: "b" } });
    expect(HTMLFormElement.prototype.requestSubmit).toHaveBeenCalledTimes(1);
  });

  /* The submit is a real navigation, so the remount below is what a reload
     looks like from the component's side. */
  it("puts focus back on the control that triggered the reload", () => {
    const first = render(<Filters />);
    fireEvent.change(screen.getByLabelText("Group"), { target: { value: "b" } });
    first.unmount();

    render(<Filters />);
    expect(screen.getByLabelText("Group")).toHaveFocus();
  });

  it("restores the caret to the end of the search box", () => {
    const first = render(<Filters />);
    fireEvent.input(screen.getByLabelText("Search"), { target: { value: "fido" } });
    vi.advanceTimersByTime(300);
    first.unmount();

    render(<Filters q="fido" />);
    const search = screen.getByLabelText("Search") as HTMLInputElement;
    expect(search).toHaveFocus();
    expect(search.selectionStart).toBe(4);
  });

  it("does not let a form in another scope claim the focus", () => {
    const first = render(<Filters scope="filters" />);
    fireEvent.change(screen.getByLabelText("Group"), { target: { value: "b" } });
    first.unmount();

    // A second auto-submitting form on the same page must neither take the
    // focus nor swallow the key before its owner mounts.
    const other = render(<Filters scope="daynav" />);
    expect(screen.getByLabelText("Group")).not.toHaveFocus();
    other.unmount();

    render(<Filters scope="filters" />);
    expect(screen.getByLabelText("Group")).toHaveFocus();
  });

  it("leaves focus alone on an ordinary arrival", () => {
    render(<Filters />);
    expect(screen.getByLabelText("Group")).not.toHaveFocus();
    expect(screen.getByLabelText("Search")).not.toHaveFocus();
  });
});
