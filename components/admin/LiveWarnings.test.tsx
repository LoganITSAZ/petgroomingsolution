// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ThresholdLiveWarning from "./ThresholdLiveWarning";
import DateRangeLiveWarning from "./DateRangeLiveWarning";

/**
 * Both warnings read their fields straight from the DOM rather than lifting
 * them into React state, so the wiring — not the arithmetic, which
 * lib/thresholds.test.ts already covers — is what these check.
 */

describe("ThresholdLiveWarning", () => {
  function Fields() {
    return (
      <>
        <input id="watch" defaultValue="10" />
        <input id="late" defaultValue="20" />
        <ThresholdLiveWarning fieldIds={["watch", "late"]} message="Out of order" />
      </>
    );
  }

  it("stays silent while the fields escalate", () => {
    render(<Fields />);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("warns as soon as a field is typed out of order", () => {
    render(<Fields />);
    fireEvent.input(document.getElementById("late")!, { target: { value: "5" } });
    expect(screen.getByRole("status")).toHaveTextContent("Out of order");
  });
});

describe("DateRangeLiveWarning", () => {
  function Window({ end }: { end: string }) {
    return (
      <DateRangeLiveWarning
        startName="startsAt"
        endName="endsAt"
        message="End must be after start"
      >
        <input name="startsAt" defaultValue="2026-09-01" />
        <input name="endsAt" defaultValue={end} />
      </DateRangeLiveWarning>
    );
  }

  it("stays silent when the window closes after it opens", () => {
    render(<Window end="2026-09-30" />);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("warns on a window that closes before it opens", () => {
    render(<Window end="2026-08-01" />);
    expect(screen.getByRole("status")).toHaveTextContent("End must be after start");
  });
});
