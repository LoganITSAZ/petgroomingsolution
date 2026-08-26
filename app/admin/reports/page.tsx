import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";
import {
  DEFAULT_REPORT_ID,
  REPORTS,
  defaultRange,
  formatCell,
  reportById,
  reportRange,
  runReport,
} from "@/lib/reports";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Reports" };

// Every figure is derived when the report is run, so a prerendered snapshot
// would serve yesterday's numbers until the next deploy.
export const dynamic = "force-dynamic";

/**
 * The shop's numbers as rows it can take away.
 *
 * The page renders whatever definition it is handed — picking a report only
 * changes the query string — so adding a report is a definition in
 * [lib/reports.ts](../../lib/reports.ts) and nothing here.
 *
 * Access is the admin layout's: this sits under `/admin`, which redirects
 * anyone who cannot manage the shop. The download route re-checks for itself,
 * because middleware does not cover `/api/*`.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { id?: string; from?: string; to?: string };
}) {
  const definition = reportById(searchParams.id ?? "") ?? reportById(DEFAULT_REPORT_ID)!;
  const range =
    searchParams.from && searchParams.to
      ? reportRange(searchParams.from, searchParams.to)
      : defaultRange();

  const result = (await runReport(definition.id, range))!;
  const query = new URLSearchParams({ id: definition.id, from: range.from, to: range.to });

  return (
    <PageShell
      title="Reports"
      subtitle={`${range.from} to ${range.to}`}
      actions={
        <a
          href={`/api/admin/reports?${query.toString()}`}
          className="text-sm font-bold px-3 py-1.5 rounded-lg bg-stone-800 text-white hover:bg-stone-900 transition-colors"
        >
          Download CSV
        </a>
      }
    >
      {/* The picker is a plain GET form: a report is a place, so it survives a
          refresh, a bookmark and the back button. */}
      <PageSection tone="muted">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-1">
              Report
            </span>
            <select
              name="id"
              defaultValue={definition.id}
              className="border border-stone-200 rounded-lg px-2 py-1.5 bg-white"
            >
              {REPORTS.map((report) => (
                <option key={report.id} value={report.id}>
                  {report.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-1">
              From
            </span>
            <input
              type="date"
              name="from"
              defaultValue={range.from}
              className="border border-stone-200 rounded-lg px-2 py-1.5 bg-white"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-1">
              To
            </span>
            <input
              type="date"
              name="to"
              defaultValue={range.to}
              className="border border-stone-200 rounded-lg px-2 py-1.5 bg-white"
            />
          </label>
          <button
            type="submit"
            className="text-sm font-bold px-3 py-1.5 rounded-lg bg-brand-600 text-brand-on-600 hover:bg-brand-700 hover:text-brand-on-700 transition-colors"
          >
            Run
          </button>
        </form>
      </PageSection>

      <PageSection>
        <p className="text-sm text-stone-600">{definition.description}</p>
        {definition.caveat && (
          <p className="text-xs text-stone-500 mt-1">{definition.caveat}</p>
        )}
      </PageSection>

      <PageSection grow scroll padded={false}>
        {result.rows.length === 0 ? (
          <p className="px-3 py-6 text-sm text-stone-500">
            Nothing in this range.{" "}
            <Link href="/admin/reports" className="text-brand-text font-bold hover:underline">
              Reset to the last 30 days
            </Link>
            .
          </p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-well border-b border-stone-200">
              <tr>
                {result.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-3 py-2 font-bold text-xs uppercase tracking-widest text-stone-500 ${
                      column.numeric ? "text-right" : "text-left"
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {result.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-well transition-colors">
                  {row.map((value, index) => (
                    <td
                      key={result.columns[index].key}
                      className={`px-3 py-1.5 ${
                        result.columns[index].numeric
                          ? "text-right tabular-nums"
                          : "text-stone-700"
                      }`}
                    >
                      {formatCell(value, result.columns[index])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {result.totals.some((total) => total != null) && (
              <tfoot className="border-t-2 border-stone-200 bg-stone-50 font-bold">
                <tr>
                  {result.totals.map((total, index) => (
                    <td
                      key={result.columns[index].key}
                      className={`px-3 py-2 ${
                        result.columns[index].numeric ? "text-right tabular-nums" : ""
                      }`}
                    >
                      {index === 0 && total == null
                        ? "Total"
                        : total == null
                          ? ""
                          : formatCell(total, result.columns[index])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </PageSection>
    </PageShell>
  );
}
