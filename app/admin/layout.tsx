import { currentStaffIsAdmin } from "@/lib/staff-roles";
import BackOfficeShell from "@/components/BackOfficeShell";
import { redirect } from "next/navigation";

/**
 * Admin screens sit inside the same back-office shell as the rest of staff —
 * one sidebar, the admin group below a divider. What is different here is the
 * gate, not the chrome.
 *
 * Authoritative check: `currentStaffIsAdmin` reads `Staff.roles` from the
 * database, so a role granted after sign-in takes effect without the person
 * having to log out and back in. Middleware cannot do this — it runs on the
 * edge with no database — so this layout is the authority for /admin, and
 * every mutation re-checks through `requireAdmin()`.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await currentStaffIsAdmin())) redirect("/staff");

  return (
    <BackOfficeShell>
      <div className="max-w-6xl">{children}</div>
    </BackOfficeShell>
  );
}
