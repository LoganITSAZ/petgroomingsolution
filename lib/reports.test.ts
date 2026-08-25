import { describe, expect, it } from "vitest";
import { completionInRange, csvField, reportRange, toCsv } from "./reports";

/**
 * A report window has two ends.
 *
 * `getCompletions()` filters on `updatedAt`, which is not when the visit
 * finished: a groom finished in July and touched again in August comes back
 * from that query for an August window. Only `finishedAt` says which report a
 * visit belongs in, and it has to be checked at both ends.
 */
describe("completionInRange", () => {
  const range = reportRange("2026-08-01", "2026-08-31");

  it("keeps a visit finished inside the window", () => {
    expect(completionInRange(new Date("2026-08-15T18:00:00Z"), range)).toBe(true);
  });

  it("drops a visit finished before the window opened", () => {
    expect(completionInRange(new Date("2026-07-03T18:00:00Z"), range)).toBe(false);
  });

  it("drops a visit finished after the window closed", () => {
    expect(completionInRange(new Date("2026-09-04T18:00:00Z"), range)).toBe(false);
  });

  it("includes the first instant and excludes the last, same as every other range", () => {
    expect(completionInRange(range.start, range)).toBe(true);
    expect(completionInRange(range.end, range)).toBe(false);
  });
});

/**
 * The export exists to be opened in Excel or Sheets, and it carries names the
 * shop typed: pet names, owner names, service names.
 */
describe("csvField", () => {
  it("quotes a field carrying a comma, a quote or a newline", () => {
    expect(csvField("Collman, Logan")).toBe('"Collman, Logan"');
    expect(csvField('Bo "Bear"')).toBe('"Bo ""Bear"""');
    expect(csvField("line\nline")).toBe('"line\nline"');
  });

  it("defuses a field a spreadsheet would run as a formula", () => {
    for (const lead of ["=", "+", "-", "@"]) {
      expect(csvField(`${lead}1+1`)).toBe(`'${lead}1+1`);
    }
  });

  it("keeps the apostrophe inside the quotes when the payload also needs quoting", () => {
    // The guard has to sit on the cell's value, not outside its quoting, or
    // the file is malformed and the formula survives.
    expect(csvField('=HYPERLINK("http://evil")')).toBe(
      `"'=HYPERLINK(""http://evil"")"`
    );
  });

  it("leaves a negative number alone — it is a figure, not a formula", () => {
    expect(csvField(-2500)).toBe("-2500");
  });

  it("renders nothing for a null cell", () => {
    expect(csvField(null)).toBe("");
  });
});

describe("toCsv", () => {
  it("exports money columns as plain dollars and keeps rows CRLF-separated", () => {
    const csv = toCsv({
      id: "t",
      name: "T",
      description: "",
      columns: [
        { key: "who", label: "Who", numeric: false, money: false },
        { key: "cents", label: "List price", numeric: true, money: true },
      ],
      rows: [["Collman, Logan", 12550]],
      totals: [null, 12550],
      range: reportRange("2026-08-01", "2026-08-01"),
    });

    expect(csv).toBe('Who,List price\r\n"Collman, Logan",125.50');
  });
});
