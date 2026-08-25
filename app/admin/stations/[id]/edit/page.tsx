import Link from "next/link";
import { notFound } from "next/navigation";
import { StationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { KENNELABLE_STATUSES } from "@/lib/kennels";
import { formatStatus } from "@/lib/utils";
import StationForm from "../../StationForm";
import { updateStation } from "../../actions";
import { PageShell } from "@/components/ui";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Edit station" };

const ERRORS: Record<string, string> = {
  name_required: "A station needs a name.",
  invalid_role: "Pick one of the listed roles.",
  invalid_grid: "Kennel units need at least one row and one kennel per row.",
  kennels_occupied:
    "This unit still has pets in it. Empty every kennel before changing the station's role.",
};

interface PageProps {
  params: { id: string };
  searchParams: { saved?: string; error?: string; kept?: string };
}

export default async function EditStationPage({ params, searchParams }: PageProps) {
  const station = await prisma.station.findUnique({
    where: { id: params.id },
    include: {
      kennels: {
        include: {
          appointments: {
            where: { status: { in: KENNELABLE_STATUSES } },
            include: { pet: { select: { name: true } } },
          },
        },
        orderBy: [{ row: "asc" }, { column: "asc" }],
      },
      _count: { select: { appointments: true } },
    },
  });
  if (!station) notFound();

  const occupied = station.kennels.filter((kennel) => kennel.appointments.length > 0);
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const kept = searchParams.kept?.split(",").filter(Boolean) ?? [];

  return (
    <PageShell
      back={{ href: "/admin/stations", label: "Back to Stations" }}
      title={station.name}
      subtitle={
        <>
          {station._count.appointments} appointment
          {station._count.appointments !== 1 ? "s" : ""} on record
          {station.role === StationRole.KENNEL &&
            ` · ${station.kennels.length} kennel${station.kennels.length !== 1 ? "s" : ""}, ${occupied.length} occupied`}
        </>
      }
    >

      {searchParams.saved === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Station saved.
          {kept.length > 0 && (
            <span className="font-normal">
              {" "}
              {kept.join(", ")} stayed in place because {kept.length === 1 ? "it is" : "they are"}{" "}
              still occupied — they disappear once emptied.
            </span>
          )}
        </p>
      )}

      {errorMessage && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          {errorMessage}
        </p>
      )}

      {occupied.length > 0 && (
        <div className="border-t border-stone-100 bg-amber-50 px-3 py-2">
          <p className="text-sm font-semibold text-amber-800">Pets currently in this unit</p>
          <ul className="text-sm text-amber-700 mt-1 space-y-0.5">
            {occupied.map((kennel) => (
              <li key={kennel.id}>
                <span className="font-medium">{kennel.label}</span> —{" "}
                {kennel.appointments
                  .map((appt) => `${appt.pet.name} (${formatStatus(appt.status)})`)
                  .join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <StationForm
        action={updateStation}
        submitLabel="Save Station"
        stationId={station.id}
        occupiedLabels={occupied.map((kennel) => kennel.label)}
        initial={{
          name: station.name,
          allowedRoles: station.allowedRoles,
          role: station.role,
          isActive: station.isActive,
          kennelRows: station.kennelRows ?? 2,
          kennelColumns: station.kennelColumns ?? 4,
        }}
      />

      {station.role === StationRole.KENNEL && (
        <p className="border-t border-stone-100 px-3 py-2 text-sm text-stone-500">
          Assign pets to individual kennels from the{" "}
          <Link href={`/staff/stations/${station.id}`} className="text-amber-700 hover:text-amber-900 underline">
            kennel board
          </Link>
          .
        </p>
      )}
    </PageShell>
  );
}
