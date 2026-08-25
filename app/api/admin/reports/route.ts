import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManage, getStaffRoles } from "@/lib/staff-roles";
import {
  DEFAULT_REPORT_ID,
  defaultRange,
  reportById,
  reportRange,
  runReport,
  toCsv,
} from "@/lib/reports";

// Derived at request time, never prerendered.
export const dynamic = "force-dynamic";

/**
 * The same report the screen shows, as a file.
 *
 * Middleware does not cover `/api/*`, so this re-checks that the caller runs
 * the shop rather than trusting the page it was linked from. The rows carry
 * customer names and estimated pay: this is not a public export.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.userType !== "staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManage(await getStaffRoles(session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const definition = reportById(params.get("id") ?? "") ?? reportById(DEFAULT_REPORT_ID)!;

  const from = params.get("from");
  const to = params.get("to");
  const range = from && to ? reportRange(from, to) : defaultRange();

  const result = await runReport(definition.id, range);
  if (!result) return NextResponse.json({ error: "Unknown report" }, { status: 404 });

  // A BOM so Excel opens the file as UTF-8 rather than mangling a name with
  // an accent in it.
  return new NextResponse(`﻿${toCsv(result)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${definition.id}-${range.from}-to-${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
