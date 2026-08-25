import { AppointmentStatus, AppointmentType, StaffRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { FINISHED_STATUSES, getCompletions } from "@/lib/analytics";
import { formatCents } from "@/lib/pricing";
import { formatServiceType, formatShopTime, formatStatus, shopDayKey, shopDayRange } from "@/lib/utils";

/**
 * Reports: the shop's numbers as rows it can take away.
 *
 * A report is one definition object — what to fetch for a date range, and the
 * columns to render — and everything else is shared: the screen renders any
 * definition, and the download route serialises the same cells to CSV. Adding
 * a report means adding a definition to `REPORTS`, never a new page.
 *
 * Two rules, both inherited from [analytics](./analytics.ts):
 *
 * - Nothing is stored. Every figure is derived from appointments and their
 *   status history at the moment the report is run, so a report never drifts
 *   from the screens it agrees with.
 * - Money is the **list** price unless a column says otherwise. Agreed rates
 *   are reported beside it as a discount, and commission is on list, which is
 *   why the pay column is labelled an estimate wherever it appears.
 */

/** A cell's underlying value. `null` renders as an em dash and exports empty. */
export type CellValue = string | number | null;

export interface ReportColumn<Row> {
  key: string;
  label: string;
  /** Right-align a column of figures. */
  numeric?: boolean;
  /** Cents, so the screen can format money and the CSV can export dollars. */
  money?: boolean;
  /** Summed into a totals row when set. */
  total?: boolean;
  value: (row: Row) => CellValue;
}

export interface ReportRange {
  /** Shop-day keys, inclusive. */
  from: string;
  to: string;
  start: Date;
  end: Date;
}

export interface ReportDefinition<Row = never> {
  id: string;
  name: string;
  /** One line on what the report answers, shown above the table. */
  description: string;
  /** Anything the reader must not misread — list prices, estimates. */
  caveat?: string;
  columns: ReportColumn<Row>[];
  run: (range: ReportRange) => Promise<Row[]>;
}

export interface ReportResult {
  id: string;
  name: string;
  description: string;
  caveat?: string;
  columns: { key: string; label: string; numeric: boolean; money: boolean }[];
  /** Raw values, one array per row, in column order. */
  rows: CellValue[][];
  /** Per-column sums, `null` for columns that do not total. */
  totals: (number | null)[];
  range: ReportRange;
}

/**
 * Whether a finished visit belongs in a report's window.
 *
 * `getCompletions()` filters on `updatedAt`, which is not when the visit
 * finished: a groom finished in July and touched again in August — its status
 * walked on to PICKED_UP, or someone edited the notes — comes back from that
 * query for an August window. `finishedAt` is the only field that says which
 * report the visit belongs in, and it has to be checked at both ends. Half a
 * check credits July's work, and July's commission, to August.
 *
 * `[start, end)`, the same half-open convention as every other range here.
 */
export function completionInRange(
  finishedAt: Date,
  range: { start: Date; end: Date }
): boolean {
  return finishedAt >= range.start && finishedAt < range.end;
}

/** Resolve two day keys into the shop's own day boundaries. */
export function reportRange(from: string, to: string): ReportRange {
  const [first, last] = from <= to ? [from, to] : [to, from];
  return {
    from: first,
    to: last,
    start: shopDayRange(new Date(`${first}T12:00:00Z`)).start,
    end: shopDayRange(new Date(`${last}T12:00:00Z`)).end,
  };
}

/** The default window: the last 30 shop days, ending today. */
export function defaultRange(days = 30): ReportRange {
  const today = shopDayKey();
  const from = shopDayKey(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
  return reportRange(from, today);
}

/**
 * Leading characters a spreadsheet treats as the start of a formula. The tab
 * and carriage return are here because both are stripped before the cell is
 * parsed, which puts the character behind them in the leading position.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * One CSV field.
 *
 * Quoting is not cosmetic here: a pet called `Bo "Bear"` or an owner with a
 * comma in their name corrupts every column after it otherwise.
 */
export function csvField(value: CellValue): string {
  if (value == null) return "";

  // A number is a figure, never a formula. Guarding it here would mangle a
  // legitimate negative into `\'-2500`, so numbers go out untouched.
  if (typeof value === "number") return String(value);

  // Everything else is text the shop typed — pet names, owner names, service
  // names. Excel and Sheets execute a cell that opens with one of these, so a
  // pet called `=HYPERLINK(...)` would run when the export is opened. A
  // leading apostrophe makes the spreadsheet read the cell as text; it is the
  // standard defusing and survives a round trip as the literal name.
  const text = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole file, header included. Money columns export as plain dollars. */
export function toCsv(result: ReportResult): string {
  const header = result.columns.map((column) => csvField(column.label));
  const body = result.rows.map((row) =>
    row.map((value, index) => {
      const column = result.columns[index];
      if (column?.money && typeof value === "number") return (value / 100).toFixed(2);
      return csvField(value);
    })
  );
  return [header, ...body].map((row) => row.join(",")).join("\r\n");
}

/** How a cell reads on screen. */
export function formatCell(
  value: CellValue,
  column: { money: boolean }
): string {
  if (value == null) return "—";
  if (column.money && typeof value === "number") return formatCents(value);
  return String(value);
}

// ── The reports themselves ────────────────────────────────────────

interface VisitRow {
  dayKey: string;
  time: string;
  petName: string;
  ownerName: string;
  services: string;
  groomer: string | null;
  status: string;
  type: string;
  listCents: number | null;
  discountCents: number;
}

const visits: ReportDefinition<VisitRow> = {
  id: "visits",
  name: "Visits",
  description: "Every visit booked in the range, with what it was quoted at.",
  caveat:
    "List price is the published price of the services booked; quoted is what the customer was told after any agreed rate.",
  columns: [
    { key: "dayKey", label: "Date", value: (row) => row.dayKey },
    { key: "time", label: "Time", value: (row) => row.time },
    { key: "petName", label: "Pet", value: (row) => row.petName },
    { key: "ownerName", label: "Owner", value: (row) => row.ownerName },
    { key: "services", label: "Services", value: (row) => row.services },
    { key: "groomer", label: "Groomer", value: (row) => row.groomer },
    { key: "status", label: "Status", value: (row) => row.status },
    { key: "type", label: "Type", value: (row) => row.type },
    {
      key: "listCents",
      label: "List price",
      numeric: true,
      money: true,
      total: true,
      value: (row) => row.listCents,
    },
    {
      key: "discountCents",
      label: "Rate discount",
      numeric: true,
      money: true,
      total: true,
      value: (row) => row.discountCents,
    },
    {
      key: "quotedCents",
      label: "Quoted",
      numeric: true,
      money: true,
      total: true,
      value: (row) =>
        row.listCents == null ? null : Math.max(0, row.listCents - row.discountCents),
    },
  ],
  async run(range) {
    const appointments = await prisma.appointment.findMany({
      where: { scheduledAt: { gte: range.start, lt: range.end } },
      include: {
        pet: { select: { name: true } },
        customer: { select: { firstName: true, lastName: true } },
        staff: { select: { name: true } },
        services: { include: { service: { select: { name: true } } }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    return appointments.map((appointment) => {
      const priced = appointment.services.filter((line) => line.priceCents != null);
      return {
        dayKey: shopDayKey(appointment.scheduledAt),
        time: formatShopTime(appointment.scheduledAt),
        petName: appointment.pet.name,
        ownerName: `${appointment.customer.lastName}, ${appointment.customer.firstName}`,
        services:
          appointment.services.length > 0
            ? appointment.services
                .map((line) => line.service?.name ?? formatServiceType(line.serviceType))
                .join("; ")
            : formatServiceType(appointment.serviceType),
        groomer: appointment.staff?.name ?? null,
        status: formatStatus(appointment.status),
        type: appointment.appointmentType === AppointmentType.WALK_IN ? "Walk-in" : "Booked",
        listCents:
          priced.length > 0 ? priced.reduce((sum, line) => sum + (line.priceCents ?? 0), 0) : null,
        discountCents: appointment.pricingDiscountCents ?? 0,
      };
    });
  },
};

interface DayRow {
  dayKey: string;
  booked: number;
  finished: number;
  cancelled: number;
  noShows: number;
  walkIns: number;
  listCents: number;
  discountCents: number;
}

const daily: ReportDefinition<DayRow> = {
  id: "daily",
  name: "Day by day",
  description: "One row per shop day: what was booked, what finished, what it was worth.",
  caveat: "Revenue is the list price of finished visits, net of agreed rates — a floor, not a till total.",
  columns: [
    { key: "dayKey", label: "Date", value: (row) => row.dayKey },
    { key: "booked", label: "Booked", numeric: true, total: true, value: (row) => row.booked },
    { key: "finished", label: "Finished", numeric: true, total: true, value: (row) => row.finished },
    { key: "walkIns", label: "Walk-ins", numeric: true, total: true, value: (row) => row.walkIns },
    { key: "cancelled", label: "Cancelled", numeric: true, total: true, value: (row) => row.cancelled },
    { key: "noShows", label: "No-shows", numeric: true, total: true, value: (row) => row.noShows },
    {
      key: "listCents",
      label: "List price",
      numeric: true,
      money: true,
      total: true,
      value: (row) => row.listCents,
    },
    {
      key: "netCents",
      label: "Net of rates",
      numeric: true,
      money: true,
      total: true,
      value: (row) => Math.max(0, row.listCents - row.discountCents),
    },
  ],
  async run(range) {
    const [appointments, completions] = await Promise.all([
      prisma.appointment.findMany({
        where: { scheduledAt: { gte: range.start, lt: range.end } },
        select: { scheduledAt: true, status: true, appointmentType: true },
      }),
      getCompletions(range.start),
    ]);

    const byDay = new Map<string, DayRow>();
    const rowFor = (dayKey: string): DayRow => {
      const existing = byDay.get(dayKey);
      if (existing) return existing;
      const created: DayRow = {
        dayKey,
        booked: 0,
        finished: 0,
        cancelled: 0,
        noShows: 0,
        walkIns: 0,
        listCents: 0,
        discountCents: 0,
      };
      byDay.set(dayKey, created);
      return created;
    };

    for (const appointment of appointments) {
      const row = rowFor(shopDayKey(appointment.scheduledAt));
      row.booked += 1;
      if (appointment.appointmentType === AppointmentType.WALK_IN) row.walkIns += 1;
      if (appointment.status === AppointmentStatus.CANCELLED) row.cancelled += 1;
      if (appointment.status === AppointmentStatus.NO_SHOW) row.noShows += 1;
      if (FINISHED_STATUSES.includes(appointment.status)) row.finished += 1;
    }

    // Money is credited to the day the visit finished, which is the day the
    // shop earned it — not the day it was booked for.
    for (const completion of completions) {
      if (!completionInRange(completion.finishedAt, range)) continue;
      const row = rowFor(completion.dayKey);
      row.listCents += completion.priceCents ?? 0;
      row.discountCents += completion.discountCents;
    }

    return Array.from(byDay.values()).sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  },
};

interface GroomerRow {
  name: string;
  finished: number;
  listCents: number;
  commissionPercent: number;
  payCents: number;
  avgTurnaroundMins: number | null;
}

const groomerPay: ReportDefinition<GroomerRow> = {
  id: "groomer-pay",
  name: "Groomer pay",
  description: "Finished visits per groomer in the range, and the commission they imply.",
  caveat:
    "An estimate, not payroll: commission is paid on the list price of the services finished, and real tickets move with pet size and surcharges.",
  columns: [
    { key: "name", label: "Groomer", value: (row) => row.name },
    { key: "finished", label: "Finished", numeric: true, total: true, value: (row) => row.finished },
    {
      key: "listCents",
      label: "List price finished",
      numeric: true,
      money: true,
      total: true,
      value: (row) => row.listCents,
    },
    {
      key: "commissionPercent",
      label: "Commission %",
      numeric: true,
      value: (row) => row.commissionPercent,
    },
    {
      key: "payCents",
      label: "Estimated pay",
      numeric: true,
      money: true,
      total: true,
      value: (row) => row.payCents,
    },
    {
      key: "avgTurnaroundMins",
      label: "Avg turnaround (min)",
      numeric: true,
      value: (row) => row.avgTurnaroundMins,
    },
  ],
  async run(range) {
    const [staff, completions, config] = await Promise.all([
      prisma.staff.findMany({
        where: { roles: { hasSome: [StaffRole.GROOMER, StaffRole.BATHER] } },
        select: { id: true, name: true, commissionPercent: true },
        orderBy: { name: "asc" },
      }),
      getCompletions(range.start),
      getConfig(),
    ]);

    const inRange = completions.filter((completion) =>
      completionInRange(completion.finishedAt, range)
    );

    return staff.map((member) => {
      const theirs = inRange.filter((completion) => completion.staffId === member.id);
      const listCents = theirs.reduce((sum, completion) => sum + (completion.priceCents ?? 0), 0);
      const percent = member.commissionPercent ?? config.defaultCommissionPercent;
      const turnarounds = theirs
        .map((completion) => completion.turnaroundMins)
        .filter((mins): mins is number => mins != null);

      return {
        name: member.name,
        finished: theirs.length,
        listCents,
        commissionPercent: percent,
        payCents: Math.round((listCents * percent) / 100),
        avgTurnaroundMins:
          turnarounds.length > 0
            ? Math.round(turnarounds.reduce((sum, mins) => sum + mins, 0) / turnarounds.length)
            : null,
      };
    });
  },
};

interface ServiceRow {
  name: string;
  booked: number;
  listCents: number;
}

const serviceMix: ReportDefinition<ServiceRow> = {
  id: "service-mix",
  name: "Service mix",
  description: "What was actually booked in the range, by service.",
  caveat: "Counts every line on every visit, so one visit appears under each service it carries.",
  columns: [
    { key: "name", label: "Service", value: (row) => row.name },
    { key: "booked", label: "Times booked", numeric: true, total: true, value: (row) => row.booked },
    {
      key: "listCents",
      label: "List price",
      numeric: true,
      money: true,
      total: true,
      value: (row) => row.listCents,
    },
  ],
  async run(range) {
    const lines = await prisma.appointmentService.findMany({
      where: { appointment: { scheduledAt: { gte: range.start, lt: range.end } } },
      select: {
        priceCents: true,
        serviceType: true,
        service: { select: { name: true } },
      },
    });

    const byName = new Map<string, ServiceRow>();
    for (const line of lines) {
      const name = line.service?.name ?? formatServiceType(line.serviceType);
      const row = byName.get(name) ?? { name, booked: 0, listCents: 0 };
      row.booked += 1;
      row.listCents += line.priceCents ?? 0;
      byName.set(name, row);
    }

    return Array.from(byName.values()).sort((a, b) => b.booked - a.booked);
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any -- the registry holds
   definitions over different row types; each one is internally sound and the
   runner only ever touches them through their own columns. */
export const REPORTS: ReportDefinition<any>[] = [visits, daily, groomerPay, serviceMix];
/* eslint-enable @typescript-eslint/no-explicit-any */

export const DEFAULT_REPORT_ID = daily.id;

export function reportById(id: string): ReportDefinition<unknown> | undefined {
  return REPORTS.find((report) => report.id === id) as ReportDefinition<unknown> | undefined;
}

/** Run a report and flatten it to cells the screen and the CSV both read. */
export async function runReport(id: string, range: ReportRange): Promise<ReportResult | null> {
  const definition = reportById(id);
  if (!definition) return null;

  const data = await definition.run(range);
  const columns = definition.columns.map((column) => ({
    key: column.key,
    label: column.label,
    numeric: Boolean(column.numeric),
    money: Boolean(column.money),
  }));
  const rows = data.map((row) => definition.columns.map((column) => column.value(row)));

  const totals = definition.columns.map((column, index) => {
    if (!column.total) return null;
    return rows.reduce((sum, row) => {
      const value = row[index];
      return typeof value === "number" ? sum + value : sum;
    }, 0);
  });

  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    caveat: definition.caveat,
    columns,
    rows,
    totals,
    range,
  };
}
