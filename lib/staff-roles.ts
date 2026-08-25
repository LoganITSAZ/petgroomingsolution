import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { StaffRole } from "@prisma/client";

/**
 * The database is the authority on what someone may do.
 *
 * A JWT is a snapshot from sign-in: granting or revoking a role does not
 * change a token that is already out there, and tokens minted before staff
 * could hold several roles carry no `roles` array at all. Anything that gates
 * access resolves the current roles here instead of trusting the session.
 *
 * Wrapped in React's `cache` so the several gates on one render — the shell's
 * sidebar, the admin layout's redirect, a page's own check — share a single
 * query per request.
 */
export const getStaffRoles = cache(async function getStaffRoles(staffId: string): Promise<StaffRole[]> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { roles: true, isActive: true },
  });
  if (!staff || !staff.isActive) return [];
  return staff.roles;
});

/** Current roles of the signed-in staff member; empty for customers and guests. */
export async function currentStaffRoles(): Promise<StaffRole[]> {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") return [];
  return getStaffRoles(session.user.id);
}

export async function currentStaffIsAdmin(): Promise<boolean> {
  return (await currentStaffRoles()).includes(StaffRole.ADMIN);
}
