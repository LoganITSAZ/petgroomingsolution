import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StationRole } from "@prisma/client";
import { getConfig } from "@/lib/config";
import { formatShopDate } from "@/lib/utils";
import StaffForm from "../../StaffForm";
import { updateStaff } from "../../actions";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Edit staff member" };

const ERRORS: Record<string, string> = {
  name_required: "Enter the person's name.",
  email_required: "Enter a valid email address.",
  invalid_role: "Pick at least one role.",
  bad_commission: "Commission has to be between 0 and 100.",
  weak_password: "Passwords must be at least 8 characters.",
  email_taken: "Someone already uses that email address.",
  self_lockout: "You cannot remove your own admin access — ask another admin to do it.",
};

export default async function EditStaffPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const [staff, config, stations] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: params.id },
      include: { _count: { select: { appointments: true } } },
    }),
    getConfig(),
    prisma.station.findMany({
      where: { isActive: true, role: { not: StationRole.KENNEL } },
      select: { id: true, name: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);
  if (!staff) notFound();

  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <div className="space-y-3">
      <div>
        <Link href="/admin/staff" className="text-sm text-stone-500 hover:text-stone-800">
          ← Back to Staff
        </Link>
        <h1 className="text-xl font-bold text-stone-900 mt-2">{staff.name}</h1>
        <p className="text-sm text-stone-500 mt-1">
          {staff._count.appointments} appointment
          {staff._count.appointments !== 1 ? "s" : ""} assigned · joined{" "}
          {formatShopDate(staff.createdAt, { month: "long", year: "numeric" })}
        </p>
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-800 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      <StaffForm
        action={updateStaff}
        submitLabel="Save"
        defaultCommission={config.defaultCommissionPercent}
        stations={stations}
        initial={{
          id: staff.id,
          name: staff.name,
          email: staff.email,
          roles: staff.roles,
          isActive: staff.isActive,
          commissionPercent: staff.commissionPercent,
          defaultStationId: staff.defaultStationId,
        }}
      />
    </div>
  );
}
