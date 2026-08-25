import { auth } from "@/lib/auth";
import { getStaffRoles } from "@/lib/staff-roles";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { NextResponse } from "next/server";

// Fields that may be updated via PATCH — explicit allowlist to prevent
// accidental exposure of sensitive or computed fields.
const PATCHABLE_FIELDS = new Set([
  "shopName",
  "shopPhone",
  "shopEmail",
  "shopAddress",
  "shopWebsite",
  "featureOnlineBooking",
  "featureWalkInPortal",
  "featureEmailNotify",
  "featureSmsNotify",
  "featureWaiverRequired",
  "featureRewards",
  "rewardVisitsPerReward",
  "rewardLabel",
  "waiverText",
  "waiverVersion",
  "businessHours",
  "shopTagline",
  "overtimeWeeklyHours",
  "emailFromAddress",
  "twilioAccountSid",
  "twilioAuthToken",
  "twilioFromNumber",
  "bookingLeadHours",
  "bookingWindowDays",
  "walkInWindowStart",
  "walkInWindowEnd",
]);

// Roles come from the database, not the token: a role granted after sign-in
// has to take effect immediately.
async function requireAdmin(session: Session | null) {
  if (!session?.user) return "Unauthorized";
  if (session.user.userType !== "staff") return "Forbidden";
  const roles = await getStaffRoles(session.user.id);
  if (!roles.includes("ADMIN")) return "Forbidden";
  return null;
}

// GET /api/admin/settings
// Returns the full SystemConfig row. Admin only.
export async function GET(_req: Request) {
  const session = await auth();
  const denied = await requireAdmin(session);
  if (denied) {
    const status = denied === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: denied }, { status });
  }

  const config = await getConfig();
  return NextResponse.json(config);
}

// PATCH /api/admin/settings
// Updates SystemConfig fields. Admin only.
// Body: partial SystemConfig (only whitelisted fields are applied)
export async function PATCH(req: Request) {
  const session = await auth();
  const denied = await requireAdmin(session);
  if (denied) {
    const status = denied === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: denied }, { status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  // Filter to only patchable fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (PATCHABLE_FIELDS.has(key)) {
      data[key] = value;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.systemConfig.upsert({
    where: { id: "global" },
    create: { id: "global", ...data },
    update: data,
  });

  return NextResponse.json(updated);
}
