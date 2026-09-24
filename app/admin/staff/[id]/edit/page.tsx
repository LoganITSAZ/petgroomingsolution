import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { WORK_STATION_ROLES } from "@/lib/stations";
import { formatShopDate } from "@/lib/utils";
import StaffForm from "../../StaffForm";
import { updateStaff } from "../../actions";
import { PageShell } from "@/components/ui";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Edit Staff" };

const ERRORS: Record<string, string> = {
  name_required: "Enter the person's name.",
  email_required: "Enter a valid email address.",
  invalid_role: "Pick at least one role.",
  bad_commission: "Commission has to be between 0 and 100.",
  weak_password: "Passwords must be at least 8 characters.",
  email_taken: "Someone already uses that email address.",
  self_lockout: "You cannot remove your own admin access — ask another admin to do it.",
};

export default async function EditStaffPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const [staff, config, stations, services] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { appointments: true } },
        commissionRates: { select: { serviceId: true, category: true, percent: true } },
      },
    }),
    getConfig(),
    prisma.station.findMany({
      where: { isActive: true, role: { in: WORK_STATION_ROLES } },
      select: { id: true, name: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.service.findMany({
      where: { isActive: true },
      select: { id: true, name: true, category: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
  ]);
  if (!staff) notFound();

  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <PageShell
      back={{ href: "/admin/staff", label: "Back to Staff" }}
      title={staff.name}
      subtitle={
        <>
          {staff._count.appointments} appointment
          {staff._count.appointments !== 1 ? "s" : ""} assigned · joined{" "}
          {formatShopDate(staff.createdAt, { month: "long", year: "numeric" })}
        </>
      }
    >

      {errorMessage && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          {errorMessage}
        </p>
      )}

      <StaffForm
        action={updateStaff}
        submitLabel="Save"
        defaultCommission={config.defaultCommissionPercent}
        stations={stations}
        services={services}
        initial={{
          id: staff.id,
          name: staff.name,
          email: staff.email,
          roles: staff.roles,
          isActive: staff.isActive,
          commissionPercent: staff.commissionPercent,
          hourlyRateCents: staff.hourlyRateCents,
          ratesByCategory: Object.fromEntries(
            staff.commissionRates
              .filter((rate) => rate.category)
              .map((rate) => [rate.category!, rate.percent])
          ),
          ratesByService: Object.fromEntries(
            staff.commissionRates
              .filter((rate) => rate.serviceId)
              .map((rate) => [rate.serviceId as string, rate.percent])
          ),
          defaultStationId: staff.defaultStationId,
        }}
      />
    </PageShell>
  );
}
