import { AppointmentStatus, StationRole } from "@prisma/client";

/**
 * The groom flow, with no server dependencies, so the kiosk (a client
 * component) and the server both work from the same list instead of keeping
 * private copies that drift.
 */
const STATUS_FLOW: AppointmentStatus[] = [
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.DRYING,
  AppointmentStatus.FINISHING,
  AppointmentStatus.COMPLETE,
  AppointmentStatus.READY_PICKUP,
  AppointmentStatus.PICKED_UP,
];

/** Next status along the flow, or null at either end. */
export function nextStatus(current: AppointmentStatus | string): AppointmentStatus | null {
  if (current === AppointmentStatus.SCHEDULED) return AppointmentStatus.CHECKED_IN;
  const index = STATUS_FLOW.indexOf(current as AppointmentStatus);
  return index >= 0 && index < STATUS_FLOW.length - 1 ? STATUS_FLOW[index + 1] : null;
}

export interface VisitStage {
  key: string;
  /** The shop's words for it — what the counter says out loud. */
  label: string;
  statuses: AppointmentStatus[];
}

/**
 * The visit as the floor reads it, in order.
 *
 * The enum is the source of truth for *state*; this is the source of truth for
 * *progress*, which is what a screen has to draw. Two statuses can share a
 * stage — a groom is done at COMPLETE and stays "awaiting checkout" once the
 * owner has been told — so the stage list is shorter than the enum and never
 * doubles back. Anything not listed (CANCELLED, NO_SHOW) is off the rail, not
 * at position zero.
 */
export const VISIT_STAGES: VisitStage[] = [
  { key: "pending", label: "Pending check-in", statuses: [AppointmentStatus.SCHEDULED] },
  { key: "kennel", label: "Checked in", statuses: [AppointmentStatus.CHECKED_IN] },
  { key: "bath", label: "Bathing", statuses: [AppointmentStatus.IN_PROGRESS] },
  { key: "dry", label: "Drying", statuses: [AppointmentStatus.DRYING] },
  { key: "groom", label: "Grooming", statuses: [AppointmentStatus.FINISHING] },
  {
    key: "checkout",
    label: "Awaiting checkout",
    statuses: [AppointmentStatus.COMPLETE, AppointmentStatus.READY_PICKUP],
  },
  { key: "done", label: "Completed", statuses: [AppointmentStatus.PICKED_UP] },
];

/** How far along the rail a status sits, or -1 when it is off it. */
export function stageIndexFor(status: AppointmentStatus | string): number {
  return VISIT_STAGES.findIndex((stage) => stage.statuses.includes(status as AppointmentStatus));
}

export interface BoardColumn {
  key: string;
  /** The shop's word for the column, and for the place a pet stands in it. */
  label: string;
  /** What a pet becomes when it is dropped here. */
  status: AppointmentStatus;
  /** Other statuses that also belong in this column. */
  alsoHolds: AppointmentStatus[];
  /** The kind of station a pet in this column stands at, or null for none. */
  stationRole: StationRole | null;
}

/**
 * The floor as five columns.
 *
 * The board used to draw one column per physical station — four groom tables
 * and two baths made seven columns that ran off the side of the screen, and
 * the counter had to read the station names to work out what stage anyone was
 * at. A column is now a **stage**, and the stations of that kind sit inside
 * it: which table a pet is on is written on the chip, where it belongs.
 *
 * The order is `STATUS_FLOW`'s, not the order the stages are usually recited
 * in — a pet is dried between the bath and the table — because a board whose
 * columns disagree with the flow makes dragging left and right meaningless.
 *
 * `stationRole` is what makes a drop one gesture instead of two: dropping into
 * Bath both advances the visit and stands the pet at a free bath. Columns with
 * no role take the pet off whatever station it was holding, which is the point
 * of them — a pet waiting for its owner is not occupying a groom table.
 */
export const BOARD_COLUMNS: BoardColumn[] = [
  {
    key: "waiting",
    label: "Waiting",
    status: AppointmentStatus.CHECKED_IN,
    alsoHolds: [],
    stationRole: null,
  },
  {
    key: "bath",
    label: "Bath",
    status: AppointmentStatus.IN_PROGRESS,
    alsoHolds: [],
    stationRole: StationRole.BATHING,
  },
  {
    key: "drying",
    label: "Drying",
    status: AppointmentStatus.DRYING,
    alsoHolds: [],
    stationRole: StationRole.DRYING,
  },
  {
    key: "grooming",
    label: "Grooming Table",
    status: AppointmentStatus.FINISHING,
    alsoHolds: [],
    stationRole: StationRole.GROOMER,
  },
  {
    key: "pickup",
    label: "Waiting Pickup",
    status: AppointmentStatus.COMPLETE,
    alsoHolds: [AppointmentStatus.READY_PICKUP],
    stationRole: null,
  },
];

/** Which column a pet in this status belongs in, or null when it is not on the board. */
export function boardColumnFor(status: AppointmentStatus | string): BoardColumn | null {
  return (
    BOARD_COLUMNS.find(
      (column) => column.status === status || column.alsoHolds.includes(status as AppointmentStatus)
    ) ?? null
  );
}

/** Start of the current uninterrupted board stage, independent of record edits. */
export function boardWaitingSince(appointment: {
  status: AppointmentStatus;
  scheduledAt: Date;
  checkedInAt: Date | null;
  completedAt: Date | null;
  statusHistory: { status: AppointmentStatus; changedAt: Date }[];
}): number {
  const column = boardColumnFor(appointment.status);
  let since: Date | undefined;
  const history = [...appointment.statusHistory].sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
  for (const entry of history) {
    if (boardColumnFor(entry.status)?.key !== column?.key) break;
    since = entry.changedAt;
  }
  return (since
    ?? (column?.key === "pickup" ? appointment.completedAt : null)
    ?? appointment.checkedInAt
    ?? appointment.scheduledAt).getTime();
}
