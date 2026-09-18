import { describe, expect, it } from "vitest";
import { AppointmentStatus } from "@prisma/client";
import { BOARD_COLUMNS, VISIT_STAGES, boardColumnFor, boardWaitingSince, nextStatus, stageIndexFor } from "./appointment-flow";

describe("board wait ordering", () => {
  const at = (hour: number) => new Date(Date.UTC(2026, 8, 15, hour));
  const visit = {
    status: AppointmentStatus.CHECKED_IN,
    scheduledAt: at(8),
    checkedInAt: at(9),
    completedAt: null,
    statusHistory: [],
  };

  it("orders waiting pets by actual check-in rather than scheduled arrival", () => {
    const earlierBooking = { ...visit, checkedInAt: at(10) };
    const longerWait = { ...visit, scheduledAt: at(10) };
    expect(boardWaitingSince(longerWait)).toBeLessThan(boardWaitingSince(earlierBooking));
  });

  it("keeps pickup wait time when the owner is notified", () => {
    expect(boardWaitingSince({
      ...visit,
      status: AppointmentStatus.READY_PICKUP,
      statusHistory: [
        { status: AppointmentStatus.READY_PICKUP, changedAt: at(12) },
        { status: AppointmentStatus.COMPLETE, changedAt: at(11) },
        { status: AppointmentStatus.FINISHING, changedAt: at(10) },
      ],
    })).toBe(at(11).getTime());
  });

  it("starts a new wait when a pet returns to a stage", () => {
    expect(boardWaitingSince({
      ...visit,
      statusHistory: [
        { status: AppointmentStatus.CHECKED_IN, changedAt: at(12) },
        { status: AppointmentStatus.IN_PROGRESS, changedAt: at(10) },
        { status: AppointmentStatus.CHECKED_IN, changedAt: at(9) },
      ],
    })).toBe(at(12).getTime());
  });

  it("uses completion time for pickup visits without history", () => {
    expect(boardWaitingSince({ ...visit, status: AppointmentStatus.COMPLETE, completedAt: at(11) }))
      .toBe(at(11).getTime());
  });
});

describe("visit stages", () => {
  it("never moves backwards along the flow", () => {
    let status: AppointmentStatus | null = AppointmentStatus.SCHEDULED;
    let seen = -1;
    while (status) {
      const index: number = stageIndexFor(status);
      expect(index).toBeGreaterThanOrEqual(seen);
      seen = index;
      status = nextStatus(status);
    }
    expect(seen).toBe(VISIT_STAGES.length - 1);
  });

  it("puts a cancelled visit off the rail", () => {
    expect(stageIndexFor(AppointmentStatus.CANCELLED)).toBe(-1);
    expect(stageIndexFor(AppointmentStatus.NO_SHOW)).toBe(-1);
  });

  it("covers every status that is on the flow exactly once", () => {
    const listed = VISIT_STAGES.flatMap((stage) => stage.statuses);
    expect(new Set(listed).size).toBe(listed.length);
  });
});

describe("floor board columns", () => {
  it("walks left to right as the visit advances", () => {
    // A board whose columns disagree with the flow makes dragging meaningless:
    // every step of STATUS_FLOW must land in the same column or a later one.
    let status: AppointmentStatus | null = AppointmentStatus.CHECKED_IN;
    let seen = -1;

    while (status) {
      const column = boardColumnFor(status);
      if (column) {
        const index = BOARD_COLUMNS.indexOf(column);
        expect(index).toBeGreaterThanOrEqual(seen);
        seen = index;
      }
      status = nextStatus(status);
    }

    expect(seen).toBe(BOARD_COLUMNS.length - 1);
  });

  it("claims each status once", () => {
    const claimed = BOARD_COLUMNS.flatMap((column) => [column.status, ...column.alsoHolds]);
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it("leaves everything off the floor out", () => {
    // Nothing that has not arrived, or never will, belongs on the board.
    expect(boardColumnFor(AppointmentStatus.SCHEDULED)).toBeNull();
    expect(boardColumnFor(AppointmentStatus.PICKED_UP)).toBeNull();
    expect(boardColumnFor(AppointmentStatus.CANCELLED)).toBeNull();
    expect(boardColumnFor(AppointmentStatus.NO_SHOW)).toBeNull();
  });
});
