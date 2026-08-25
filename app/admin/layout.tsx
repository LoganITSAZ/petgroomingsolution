import { currentStaffCanManage } from "@/lib/staff-roles";
import BackOfficeShell from "@/components/BackOfficeShell";
import { redirect } from "next/navigation";

/**
 * Admin screens sit inside the same back-office shell as the rest of staff —
 * one sidebar, the admin group below a divider. What is different here is the
 * gate, not the chrome.
 *
 * Authoritative check: `currentStaffCanManage` reads `Staff.roles` from the
 * database, so a role granted after sign-in takes effect without the person
 * having to log out and back in. Middleware cannot do this — it runs on the
 * edge with no database — so this layout is the authority for /admin, and
 * every mutation re-checks through `requireManager()` or, for the technical
 * screens, `requireAdmin()`.
 *
 * A shop manager gets everything here except the two technical screens, which
 * gate themselves: system status (`/admin`) and notification credentials.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await currentStaffCanManage())) redirect("/staff");

  return (
    <BackOfficeShell>
      <div className="max-w-6xl">{children}</div>
    </BackOfficeShell>
  );
}
