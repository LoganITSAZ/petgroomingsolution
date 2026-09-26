import { describe, expect, it } from "vitest";
import {
  describeVisitTime,
  householdReadyToTell,
  joinPetNames,
  summariseVisitTimes,
  visitTime,
  waitingOn,
  workedMins,
} from "./visit-time";

// 9:00 in the shop (America/Phoenix is UTC-7 all year).
const OPEN = new Date("2026-09-14T16:00:00Z");
const at = (mins: number) => new Date(OPEN.getTime() + mins * 60_000);
const row = (status: string, mins: number) => ({ status, changedAt: at(mins) });

/** A visit that went through every stage, finished and was collected. */
const fullVisit = [
  row("CHECKED_IN", 0),
  row("IN_PROGRESS", 10),
  row("DRYING", 40),
  row("FINISHING", 60),
  row("COMPLETE", 110),
  row("READY_PICKUP", 125),
  row("PICKED_UP", 155),
];

describe("visitTime", () => {
  it("puts each segment in its stage and ends it at the next row", () => {
    expect(visitTime(fullVisit, at(500))).toEqual({
      mins: { waiting: 10, bath: 30, drying: 20, table: 50, household: 15, collect: 30 },
      openBucket: null,
      suspect: false,
    });
  });

  it("reads rows in time order whatever order they arrive in", () => {
    expect(visitTime([...fullVisit].reverse(), at(500)).mins.table).toBe(50);
  });

  it("adds a second trip through a stage to the first", () => {
    const history = [
      row("CHECKED_IN", 0),
      row("IN_PROGRESS", 5),
      row("DRYING", 25),
      row("IN_PROGRESS", 35), // back for a rewash
      row("DRYING", 45),
      row("FINISHING", 60),
      row("COMPLETE", 90),
    ];
    const time = visitTime(history, at(95));
    expect(time.mins.bath).toBe(30);
    expect(time.mins.drying).toBe(25);
  });

  it("calls a stage clicked through unmeasured, not zero", () => {
    const history = [row("CHECKED_IN", 0), row("IN_PROGRESS", 10), row("DRYING", 40), row("FINISHING", 40.5), row("COMPLETE", 90)];
    const time = visitTime(history, at(95));
    expect(time.mins.drying).toBeNull();
    expect(time.suspect).toBe(false);
  });

  it("calls a forgotten overnight tap unmeasured", () => {
    // Collected at 5pm, Picked Up tapped at 9am the next day.
    const history = [row("CHECKED_IN", 0), row("FINISHING", 10), row("COMPLETE", 60), row("READY_PICKUP", 480), row("PICKED_UP", 1440)];
    expect(visitTime(history, at(1500)).mins.collect).toBeNull();
  });

  it("calls a groom stage over three hours unmeasured and marks the visit suspect", () => {
    const history = [row("CHECKED_IN", 0), row("FINISHING", 10), row("COMPLETE", 200)];
    const time = visitTime(history, at(210));
    expect(time.mins.table).toBeNull();
    expect(time.suspect).toBe(true);
  });

  it("lets waiting and owner-to-collect run all afternoon", () => {
    const history = [row("CHECKED_IN", 0), row("FINISHING", 10), row("COMPLETE", 60), row("READY_PICKUP", 70), row("PICKED_UP", 370)];
    expect(visitTime(history, at(400)).mins.collect).toBe(300);
  });

  it("measures an open visit up to now and says which stage is open", () => {
    const history = [row("CHECKED_IN", 0), row("IN_PROGRESS", 10)];
    expect(visitTime(history, at(35))).toEqual({
      mins: { waiting: 10, bath: 25 },
      openBucket: "bath",
      suspect: false,
    });
  });

  it("opens nothing for a cancelled or scheduled row", () => {
    const history = [row("SCHEDULED", -600), row("CHECKED_IN", 0), row("CANCELLED", 20)];
    expect(visitTime(history, at(500))).toEqual({ mins: { waiting: 20 }, openBucket: null, suspect: false });
  });
});

describe("workedMins", () => {
  it("is bath plus drying plus table", () => {
    expect(workedMins(visitTime(fullVisit, at(500)))).toBe(100);
  });

  it("counts a clicked-through stage as nothing rather than giving up", () => {
    const history = [row("CHECKED_IN", 0), row("IN_PROGRESS", 10), row("DRYING", 40), row("FINISHING", 40.5), row("COMPLETE", 90)];
    expect(workedMins(visitTime(history, at(95)))).toBe(80);
  });

  it("gives up when a groom stage was cut for being too long", () => {
    const history = [row("CHECKED_IN", 0), row("FINISHING", 10), row("COMPLETE", 200)];
    expect(workedMins(visitTime(history, at(210)))).toBeNull();
  });

  it("is null when neither the bath nor the table was measured", () => {
    const history = [row("CHECKED_IN", 0), row("COMPLETE", 60)];
    expect(workedMins(visitTime(history, at(70)))).toBeNull();
  });
});

describe("summariseVisitTimes", () => {
  const finished = (tableMins: number) =>
    visitTime([row("CHECKED_IN", 0), row("FINISHING", 10), row("COMPLETE", 10 + tableMins), row("PICKED_UP", 20 + tableMins)], at(900));

  it("says nothing below the minimum number of visits", () => {
    const table = summariseVisitTimes([finished(40), finished(50)]).find((s) => s.bucket === "table");
    expect(table).toMatchObject({ medianMins: null, visits: 2 });
  });

  it("takes the median, so one long visit does not move it", () => {
    const table = summariseVisitTimes([finished(40), finished(45), finished(50), finished(170)]).find((s) => s.bucket === "table");
    expect(table).toMatchObject({ medianMins: 48, visits: 4, evidence: "Median of 4 visits" });
  });

  it("leaves out a stage that is still open", () => {
    const open = visitTime([row("CHECKED_IN", 0), row("COMPLETE", 30), row("READY_PICKUP", 40)], at(45));
    const collect = summariseVisitTimes([open]).find((s) => s.bucket === "collect");
    expect(collect?.visits).toBe(0);
  });

  it("returns every stage in order with its label", () => {
    expect(summariseVisitTimes([]).map((s) => s.label)).toEqual([
      "Waiting",
      "Bath",
      "Drying",
      "Table",
      "Waiting for the household",
      "Owner to collect",
    ]);
  });
});

describe("describeVisitTime", () => {
  it("lists the stages entered, dashes for unmeasured, and so far for the open one", () => {
    const history = [row("CHECKED_IN", 0), row("IN_PROGRESS", 10), row("DRYING", 40), row("FINISHING", 40.5)];
    expect(describeVisitTime(visitTime(history, at(60)))).toBe(
      "Waiting 10 min · Bath 30 min · Drying — · Table 20 min so far"
    );
  });

  it("is null when nothing was entered", () => {
    expect(describeVisitTime(visitTime([row("SCHEDULED", 0)], at(10)))).toBeNull();
  });
});

describe("householdReadyToTell", () => {
  it("tells the owner about a lone dog as soon as it finishes", () => {
    expect(householdReadyToTell([{ id: "a", status: "COMPLETE" }])).toEqual(["a"]);
  });

  it("holds a finished dog while its sibling is still on the table", () => {
    expect(householdReadyToTell([{ id: "a", status: "COMPLETE" }, { id: "b", status: "FINISHING" }])).toEqual([]);
  });

  it("releases every finished dog when the last one finishes", () => {
    expect(
      householdReadyToTell([
        { id: "a", status: "COMPLETE" },
        { id: "b", status: "COMPLETE" },
        { id: "c", status: "READY_PICKUP" },
      ])
    ).toEqual(["a", "b"]);
  });

  it("is not held back by a sibling cancelled or marked no-show", () => {
    expect(
      householdReadyToTell([
        { id: "a", status: "COMPLETE" },
        { id: "b", status: "CANCELLED" },
        { id: "c", status: "NO_SHOW" },
      ])
    ).toEqual(["a"]);
  });

  it("is not held back by a sibling that has not arrived", () => {
    expect(householdReadyToTell([{ id: "a", status: "COMPLETE" }, { id: "b", status: "SCHEDULED" }])).toEqual(["a"]);
  });
});

describe("waitingOn", () => {
  it("names the dogs still being worked on", () => {
    expect(
      waitingOn([
        { status: "COMPLETE", petName: "Max" },
        { status: "DRYING", petName: "Bella" },
        { status: "SCHEDULED", petName: "Rex" },
      ])
    ).toEqual(["Bella"]);
  });
});

describe("joinPetNames", () => {
  it("joins one, two and three names the way they are said", () => {
    expect(joinPetNames(["Max"])).toEqual({ names: "Max", verb: "is" });
    expect(joinPetNames(["Max", "Bella"])).toEqual({ names: "Max and Bella", verb: "are" });
    expect(joinPetNames(["Max", "Bella", "Rex"])).toEqual({ names: "Max, Bella and Rex", verb: "are" });
  });
});
