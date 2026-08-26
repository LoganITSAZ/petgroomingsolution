import { describe, expect, it } from "vitest";
import { AppointmentStatus } from "@prisma/client";
import { BOARD_COLUMNS, VISIT_STAGES, boardColumnFor, nextStatus, stageIndexFor } from "./appointment-flow";

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
