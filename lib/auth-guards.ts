import { auth } from "@/lib/auth";
import { getStaffRoles } from "@/lib/staff-roles";
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

/** Signed-in admin. Returns their id. Roles are read from the database. */
export async function requireAdmin(): Promise<string> {
  const session = await auth();
  if (session?.user?.userType !== "staff") {
    throw new Error("Unauthorized");
  }
  const roles = await getStaffRoles(session.user.id);
  if (!roles.includes(StaffRole.ADMIN)) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}
