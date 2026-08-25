import Link from "next/link";
import { StaffRole, StationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import StaffForm from "../StaffForm";
import { createStaff } from "../actions";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "New staff member" };

const ERRORS: Record<string, string> = {
  name_required: "Enter the person's name.",
  email_required: "Enter a valid email address.",
  invalid_role: "Pick at least one role.",
  bad_commission: "Commission has to be between 0 and 100.",
  weak_password: "Passwords must be at least 8 characters.",
  email_taken: "Someone already uses that email address.",
};

export default async function NewStaffPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
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
    <div className="space-y-3">
      <div>
        <Link href="/admin/staff" className="text-sm text-stone-500 hover:text-stone-800">
          ← Back to Staff
        </Link>
        <h1 className="text-xl font-bold text-stone-900 mt-2">Add Staff</h1>
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-800 text-sm font-medium">
          {errorMessage}
        </div>
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
    </div>
  );
}
