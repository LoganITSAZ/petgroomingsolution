import { StaffRole, StationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import StaffForm from "../StaffForm";
import { createStaff } from "../actions";
import { PageShell } from "@/components/ui";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Add Staff" };

const ERRORS: Record<string, string> = {
  name_required: "Enter the person's name.",
  email_required: "Enter a valid email address.",
  invalid_role: "Pick at least one role.",
  bad_commission: "Commission has to be between 0 and 100.",
  weak_password: "Passwords must be at least 8 characters.",
  email_taken: "Someone already uses that email address.",
};

export default async function NewStaffPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const [config, stations] = await Promise.all([
    getConfig(),
    prisma.station.findMany({
      where: { isActive: true, role: { not: StationRole.KENNEL } },
      select: { id: true, name: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <PageShell back={{ href: "/admin/staff", label: "Back to Staff" }} title="Add Staff">

      {errorMessage && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          {errorMessage}
        </p>
      )}

      <StaffForm
        action={createStaff}
        submitLabel="Add Staff Member"
        defaultCommission={config.defaultCommissionPercent}
        stations={stations}
        initial={{
          name: "",
          email: "",
          roles: [StaffRole.GROOMER],
          isActive: true,
          commissionPercent: null,
          defaultStationId: null,
        }}
      />
    </PageShell>
  );
}
