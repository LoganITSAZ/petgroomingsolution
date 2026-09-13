// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ScheduleWeekSync from "./ScheduleWeekSync";

function TwoDayRow() {
  return (
    <ScheduleWeekSync>
      <table>
        <tbody>
          <tr data-staff="staff-1">
            <td>
              <label>
                <input type="checkbox" data-role="row-sync-toggle" aria-label="sync" />
              </label>
            </td>
            <td>
              <input type="time" data-role="empty-start" defaultValue="08:00" aria-label="mon-start" />
              <input type="time" data-role="empty-end" defaultValue="17:00" aria-label="mon-end" />
            </td>
            <td>
              <input type="time" data-role="empty-start" defaultValue="08:00" aria-label="tue-start" />
              <input type="time" data-role="empty-end" defaultValue="17:00" aria-label="tue-end" />
            </td>
          </tr>
        </tbody>
      </table>
    </ScheduleWeekSync>
  );
}

describe("ScheduleWeekSync", () => {
  it("does nothing while the row's toggle is off", () => {
    render(<TwoDayRow />);
    fireEvent.input(screen.getByLabelText("mon-start"), { target: { value: "09:00" } });
    expect(screen.getByLabelText("tue-start")).toHaveValue("08:00");
  });

  it("copies an edited empty-day field to every other empty day in the same row once the toggle is on", () => {
    render(<TwoDayRow />);
    fireEvent.click(screen.getByLabelText("sync"));
    fireEvent.input(screen.getByLabelText("mon-start"), { target: { value: "09:00" } });
    expect(screen.getByLabelText("tue-start")).toHaveValue("09:00");
  });

  it("catches the row up to the first day's values as soon as the toggle is switched on", () => {
    render(<TwoDayRow />);
    fireEvent.input(screen.getByLabelText("mon-end"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByLabelText("sync"));
    expect(screen.getByLabelText("tue-end")).toHaveValue("18:00");
  });
});
