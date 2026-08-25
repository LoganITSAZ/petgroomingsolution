import BackOfficeShell from "@/components/BackOfficeShell";

/**
 * Staff and admin screens share one shell — see
 * [BackOfficeShell](components/BackOfficeShell.tsx), which also holds the
 * signed-in-staff guard.
 */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <BackOfficeShell>{children}</BackOfficeShell>;
}
