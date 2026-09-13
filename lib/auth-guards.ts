import { auth } from "@/lib/auth";
import { canManage, getStaffRoles } from "@/lib/staff-roles";
import { StaffRole } from "@prisma/client";

/**
 * Server actions are their own HTTP endpoints: middleware and the layout's
 * session check do not run for them, so a mutation that only lives behind an
 * admin page is still reachable by anyone who can invoke the action. Every
 * action re-authorises through these guards.
 */

/** Signed-in staff member. Returns their id. */
export async function requireStaff(): Promise<string> {
  const session = await auth();
  if (session?.user?.userType !== "staff") {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

/**
 * Signed-in staff member holding one of `allowed`. Returns their id.
 *
 * Roles come from the database, never the token: a JWT is a snapshot from
 * sign-in, so a revoked role would otherwise survive until the next logout.
 */
async function requireRoles(allowed: (roles: StaffRole[]) => boolean): Promise<string> {
  const id = await requireStaff();
  if (!allowed(await getStaffRoles(id))) {
    throw new Error("Unauthorized");
  }
  return id;
}

/**
 * Signed-in manager or admin. Returns their id.
 *
 * This is the gate for running the shop — prices, rota, staff, waiver. The
 * technical screens (system status, notification credentials) use
 * `requireAdmin()` instead, and that difference is the only thing separating
 * the two roles.
 */
export async function requireManager(): Promise<string> {
  return requireRoles(canManage);
}

/** Signed-in admin. Returns their id. Roles are read from the database. */
export async function requireAdmin(): Promise<string> {
  return requireRoles((roles) => roles.includes(StaffRole.ADMIN));
}
